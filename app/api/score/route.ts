import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { scoreArgument } from "@/lib/ai/judge";
import { finalizeIfComplete } from "@/lib/debates/finalize";
import { NextResponse } from "next/server";

// Service role client — bypasses RLS for writing scores
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { argumentId } = await request.json();

    // Fetch and moderate content before scoring
    const { data: argCheck } = await serviceClient
        .from("arguments")
        .select("content")
        .eq("id", argumentId)
        .single();

    if (argCheck) {
        const { moderateContent } = await import("@/lib/moderation");
        const modResult = moderateContent(argCheck.content);
        if (!modResult.allowed) {
            await serviceClient
                .from("arguments")
                .update({ scoring_status: "failed", ai_feedback: modResult.reason })
                .eq("id", argumentId);
            return NextResponse.json({ error: modResult.reason }, { status: 400 });
        }
    }

    // Fetch argument + debate context using service client
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
        arg.debates.player_a_id === user.id ||
        arg.debates.player_b_id === user.id;
    if (!isParticipant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent double scoring
    if (arg.scoring_status === "done") {
        return NextResponse.json({ error: "Already scored" }, { status: 400 });
    }

    // Mark as scoring
    await serviceClient
        .from("arguments")
        .update({ scoring_status: "scoring" })
        .eq("id", argumentId);

    // Get previous argument from opponent for rebuttal context
    const { data: prevArgs } = await serviceClient
        .from("arguments")
        .select("content")
        .eq("debate_id", arg.debate_id)
        .neq("user_id", arg.user_id)
        .order("submitted_at", { ascending: false })
        .limit(1);

    const prevArgument = prevArgs?.[0]?.content ?? null;

    // Determine side
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

        // Write score back
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

        // A failed argument is terminal (scores 0). If it was the last
        // outstanding argument, finalize now so the debate doesn't hang in
        // `scoring` waiting for a score that will never arrive.
        await finalizeIfComplete(serviceClient, arg.debate_id);

        return NextResponse.json(
            { error: "Scoring failed", details: String(error) },
            { status: 500 }
        );
    }
}