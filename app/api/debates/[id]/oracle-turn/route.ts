import { createClient as createServiceClient } from "@supabase/supabase-js";
import { argueAsOracle, ORACLE_USER_ID, type OracleHistoryEntry } from "@/lib/ai/oracle";
import { NextResponse } from "next/server";

// POST /api/debates/[id]/oracle-turn
//
// Drives the Oracle's move in a vs-AI debate. This is a SYSTEM action, invoked
// by (a) the argument route immediately after the human submits, and (b) the
// maintenance cron as a backstop for a dropped trigger. Both authenticate with
// the internal shared secret (CRON_SECRET). It is NEVER a user-facing call.
//
// Responsibilities, in order:
//   1. Authorize via internal secret.
//   2. Load the debate; verify it is a vs-Oracle debate that is active and on
//      the Oracle's turn. Anything else is a benign no-op (idempotent: safe to
//      call twice; the submit_argument guard rejects a duplicate).
//   3. Generate the Oracle's argument on its assigned side.
//   4. Submit it via the same submit_argument SQL function humans use, which
//      advances the turn/round and (on the final argument) flips to scoring.
//   5. Trigger scoring for the Oracle's argument, exactly like the human path.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const internal = request.headers.get("x-internal-secret");
    const header = request.headers.get("authorization");
    return internal === secret || header === `Bearer ${secret}`;
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load debate + topic + full argument transcript (oldest first).
    const { data: debate, error } = await serviceClient
        .from("debates")
        .select(`
            id, status, player_a_id, player_b_id, player_a_side,
            current_turn, current_round, total_rounds,
            topics (title),
            arguments ( user_id, round_number, content, submitted_at )
        `)
        .eq("id", id)
        .single();

    if (error || !debate) {
        return NextResponse.json({ error: "Debate not found" }, { status: 404 });
    }

    // Must be a vs-Oracle debate.
    if (debate.player_b_id !== ORACLE_USER_ID) {
        return NextResponse.json({ ok: true, skipped: "not_an_oracle_debate" });
    }
    // Must be active and the Oracle's turn. Otherwise nothing to do.
    if (debate.status !== "active" || debate.current_turn !== ORACLE_USER_ID) {
        return NextResponse.json({ ok: true, skipped: "not_oracle_turn" });
    }

    // The Oracle is player_b, so its side is the opposite of player_a_side.
    const oracleSide: "FOR" | "AGAINST" =
        debate.player_a_side === "FOR" ? "AGAINST" : "FOR";

    // Build the transcript with each entry's side, oldest first.
    type ArgRow = { user_id: string; content: string; submitted_at: string };
    const args = ((debate.arguments ?? []) as ArgRow[])
        .slice()
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));

    const sideOf = (userId: string): "FOR" | "AGAINST" => {
        if (userId === debate.player_a_id) return debate.player_a_side as "FOR" | "AGAINST";
        return oracleSide;
    };
    const history: OracleHistoryEntry[] = args.map((a) => ({
        side: sideOf(a.user_id),
        content: a.content,
    }));

    const topicTitle =
        (debate.topics as { title?: string } | { title?: string }[] | null);
    const title = Array.isArray(topicTitle)
        ? topicTitle[0]?.title ?? ""
        : topicTitle?.title ?? "";

    let content: string;
    try {
        content = await argueAsOracle(
            title,
            oracleSide,
            history,
            debate.current_round ?? 1,
            debate.total_rounds ?? 3
        );
    } catch (e) {
        // Leave the turn on the Oracle; the maintenance cron will retry. We do
        // NOT forfeit here — a transient Gemini error shouldn't cost a turn.
        return NextResponse.json(
            { error: "Oracle could not generate an argument", details: String(e) },
            { status: 503 }
        );
    }

    if (!content || content.trim().length === 0) {
        return NextResponse.json({ error: "Empty Oracle argument" }, { status: 503 });
    }

    // Submit through the same atomic SQL function humans use. Its guards make
    // this idempotent: a duplicate call for the same round raises
    // 'already_submitted_this_round', which we treat as a benign no-op.
    const { data: argId, error: rpcError } = await serviceClient.rpc("submit_argument", {
        p_debate_id: id,
        p_user_id: ORACLE_USER_ID,
        p_content: content.trim(),
    });

    if (rpcError) {
        if (rpcError.message.includes("already_submitted_this_round") ||
            rpcError.message.includes("not_your_turn")) {
            return NextResponse.json({ ok: true, skipped: "already_moved" });
        }
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const argumentId = typeof argId === "string" ? argId : null;
    if (!argumentId) {
        return NextResponse.json({ error: "Failed to submit Oracle argument" }, { status: 500 });
    }

    // Async scoring (Phase 2): enqueue a durable job, then fire the score call
    // without awaiting, matching the human submit path. The queue + maintenance
    // cron recover a dropped trigger.
    const origin = new URL(request.url).origin;
    try {
        await serviceClient.rpc("enqueue_scoring_job", {
            p_argument_id: argumentId,
            p_user_id: ORACLE_USER_ID,
        });
    } catch {
        /* the cron also scans stuck 'pending' arguments, so this is non-fatal */
    }
    try {
        void fetch(`${origin}/api/score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-secret": process.env.CRON_SECRET ?? "",
            },
            body: JSON.stringify({ argumentId, userId: ORACLE_USER_ID }),
        });
    } catch {
        /* recovered asynchronously by the queue / maintenance requeue */
    }

    // If the Oracle's reply handed the turn back to the human (a multi-round
    // vs-Oracle debate that is still active), nudge them via web push
    // (ROADMAP 2.4 item 3). Fire-and-forget + fail-open; notifyTurn itself
    // skips non-active debates and never pushes the Oracle. On the final round
    // the debate flips to scoring, so this correctly no-ops.
    const { notifyTurn } = await import("@/lib/push/turn");
    void notifyTurn(id);

    return NextResponse.json({ ok: true, argumentId });
}
