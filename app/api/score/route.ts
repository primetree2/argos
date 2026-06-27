import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { scoreArgument } from "@/lib/ai/judge";
import { finalizeIfComplete } from "@/lib/debates/finalize";
import { checkRateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

// Rate limit only the DIRECT (browser self-heal) path. Trusted internal callers
// (argument route, oracle-turn, maintenance requeue) bear CRON_SECRET and are
// exempt so legitimate scoring is never throttled. 60/60s is generous for the
// self-heal retry loop yet caps a runaway client hammering Gemini.
const SCORE_LIMIT = 60;
const SCORE_WINDOW_SECONDS = 60;

// POST /api/score  { argumentId, userId? }
//
// Scores a single argument with the AI judge and writes the result back.
//
// Auth: this is fundamentally a SYSTEM action, not a user action. It is invoked
// by (a) the argument route immediately after a successful submit, (b) the
// maintenance requeue step, and (c) the client self-heal retry. The first two
// authenticate with an internal shared secret (CRON_SECRET) and pass the
// already-validated userId. Direct browser calls (self-heal) fall back to
// cookie auth. Relying ONLY on the submitter's forwarded cookie previously
// caused arguments to strand in 'pending' when a mobile session was stale.

// Service role client — bypasses RLS for reading context and writing scores.
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const { argumentId, userId: bodyUserId } = await request.json();

    if (typeof argumentId !== "string" || !argumentId) {
        return NextResponse.json({ error: "Missing argumentId" }, { status: 400 });
    }

    // Resolve the caller identity. Trusted internal callers present the shared
    // secret and the userId; otherwise we fall back to the session cookie.
    const secret = process.env.CRON_SECRET;
    const internalSecret = request.headers.get("x-internal-secret");
    const isInternal = !!secret && internalSecret === secret;

    let callerId: string | null = null;
    if (isInternal && typeof bodyUserId === "string") {
        callerId = bodyUserId;
    } else {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        callerId = user?.id ?? null;
    }

    if (!callerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Throttle only untrusted (direct browser) callers. Internal system calls
    // are exempt — they are already gated by the shared secret and drive the
    // core scoring flow.
    if (!isInternal) {
        if (!(await checkRateLimit(serviceClient, `score:${callerId}`, SCORE_LIMIT, SCORE_WINDOW_SECONDS))) {
            return NextResponse.json(
                { error: "Too many scoring requests. Try again shortly." },
                { status: 429 }
            );
        }
    }

    // Fetch argument + debate context using the service client.
    const { data: arg, error: argError } = await serviceClient
        .from("arguments")
        .select(`
      *,
      debates (
        topic_id,
        player_a_id,
        player_b_id,
        player_a_side,
        topics (title)
      )
    `)
        .eq("id", argumentId)
        .single();

    if (argError || !arg) {
        return NextResponse.json({ error: "Argument not found" }, { status: 404 });
    }

    // Security (#6): verify the caller is a participant in this debate before
    // scoring. Without this, any authenticated user could submit an arbitrary
    // argumentId and trigger scoring on debates they are not part of.
    const isParticipant =
        arg.debates.player_a_id === callerId ||
        arg.debates.player_b_id === callerId;
    if (!isParticipant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Already scored — benign no-op (200). Returning 400 here previously made
    // legitimate retries (double-fire, self-heal, requeue) look like errors.
    if (arg.scoring_status === "done") {
        await serviceClient.rpc("complete_scoring_job", { p_argument_id: argumentId });
        return NextResponse.json({ ok: true, alreadyScored: true });
    }

    // Content was already moderated pre-write in the argument route, so there is
    // no second moderation pass here. (A previous duplicate check could mark an
    // already-accepted argument 'failed'.)

    // Mark as scoring (idempotent — safe for concurrent retries).
    await serviceClient
        .from("arguments")
        .update({ scoring_status: "scoring" })
        .eq("id", argumentId);

    // Rebuttal context: the opponent's most recent argument submitted BEFORE
    // this one. Scoping by submitted_at (rather than "latest overall") ensures
    // round 2+ arguments are judged against the argument they actually replied
    // to, not a later one delivered by a race.
    const { data: prevArgs } = await serviceClient
        .from("arguments")
        .select("content")
        .eq("debate_id", arg.debate_id)
        .neq("user_id", arg.user_id)
        .lt("submitted_at", arg.submitted_at)
        .order("submitted_at", { ascending: false })
        .limit(1);

    const prevArgument = prevArgs?.[0]?.content ?? null;

    // Determine side.
    const isPlayerA = arg.debates.player_a_id === arg.user_id;
    const side = isPlayerA
        ? arg.debates.player_a_side
        : arg.debates.player_a_side === "FOR"
            ? "AGAINST"
            : "FOR";

    try {
        const score = await scoreArgument(
            arg.debates.topics.title,
            side as "FOR" | "AGAINST",
            arg.content,
            prevArgument
        );

        const { data: updated } = await serviceClient
            .from("arguments")
            .update({
                score_total: score.total,
                score_clarity: score.clarity,
                score_evidence: score.evidence,
                score_logic: score.logic,
                score_rebuttal: score.rebuttal,
                fallacy_penalty: score.fallacy_penalty,
                fallacies_found: score.fallacies_found,
                ai_feedback: score.feedback,
                scoring_status: "done",
            })
            .eq("id", argumentId)
            .select()
            .single();

        // Terminal: drop the queue job so the cron stops re-driving it.
        await serviceClient.rpc("complete_scoring_job", { p_argument_id: argumentId });

        // If every argument is now scored, finalize the debate (completion +
        // Elo/stats). finalizeIfComplete is idempotent and guarded by a
        // conditional update, so concurrent final-score requests can't
        // double-apply ratings or insert duplicate elo_history rows.
        await finalizeIfComplete(serviceClient, arg.debate_id);

        return NextResponse.json({ score, argument: updated });
    } catch (error) {
        console.error("Scoring error:", error);

        await serviceClient
            .from("arguments")
            .update({
                scoring_status: "failed",
                ai_feedback:
                    "The Oracle could not score this argument (scoring service error). It counts as 0.",
            })
            .eq("id", argumentId);

        // A failed argument is terminal (scores 0): drop the queue job so it is
        // not re-driven forever.
        await serviceClient.rpc("complete_scoring_job", { p_argument_id: argumentId });

        // If it was the last outstanding argument, finalize now so the debate
        // doesn't hang in `scoring` waiting for a score that will never arrive.
        await finalizeIfComplete(serviceClient, arg.debate_id);

        return NextResponse.json(
            { error: "Scoring failed", details: String(error) },
            { status: 500 }
        );
    }
}
