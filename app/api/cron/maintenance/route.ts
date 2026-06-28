import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { forfeitDebate } from "@/lib/debates/forfeit";
import { ORACLE_USER_ID } from "@/lib/ai/oracle";

// Combined maintenance cron.
//
// Vercel's free Hobby plan allows a maximum of 2 cron jobs, each able to run
// at most once per day. To stay within those limits we merge the previous
// `auto-forfeit` and `cleanup-stale` jobs into this single route, which is
// triggered every ~5 minutes for free by the GitHub Actions workflow
// (.github/workflows/maintenance-cron.yml).
//
// It performs, in order:
//   1. Auto-forfeit: advance any active debate whose current turn has been
//      idle longer than the turn limit + grace.
//   2. Requeue scoring: re-drive arguments stranded in a non-terminal scoring
//      state (pending/scoring) so a dropped trigger can't strand a debate.
//   3. Cleanup: delete `waiting` debates older than 24h that were never joined.
//   4. Ghost resolution: settle long-abandoned `active` debates (48h+).
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We also accept
// Vercel's own cron header. Any other caller is rejected.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 10-minute turn + 1-minute grace = 11 minutes (standard debates).
const TURN_TIMEOUT_MS = 11 * 60 * 1000;
// Blitz: 90s turn + 30s grace = 120s. (ROADMAP Phase 3 item 3.)
const BLITZ_TIMEOUT_MS = 120 * 1000;
// Arguments stuck in pending/scoring longer than this are considered dropped
// and re-driven through the score endpoint.
const STUCK_SCORING_MS = 2 * 60 * 1000;
const FORFEIT_TEXT =
    "[Forfeit] The allotted time elapsed before an argument was submitted. This turn is forfeited.";

function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    const header = request.headers.get("authorization");
    if (secret && header === `Bearer ${secret}`) return true;
    if (request.headers.get("x-vercel-cron") === "1") return true;
    return false;
}

// ── Step 1: auto-forfeit idle turns ────────────────────────────────────
async function runAutoForfeit(): Promise<{ forfeited: string[]; error?: string }> {
    // Query against the SMALLER (blitz) cutoff so blitz debates are visible,
    // then apply each debate's own threshold below. Standard debates keep the
    // full 11-minute window.
    const wideCutoff = new Date(Date.now() - BLITZ_TIMEOUT_MS).toISOString();

    const { data: stale, error } = await serviceClient
        .from("debates")
        .select(
            "id, player_a_id, player_b_id, current_turn, current_round, total_rounds, status, turn_started_at, blitz"
        )
        .eq("status", "active")
        .not("turn_started_at", "is", null)
        .lt("turn_started_at", wideCutoff);

    if (error) return { forfeited: [], error: error.message };

    const processed: string[] = [];
    const now = Date.now();

    for (const d of stale ?? []) {
        // Apply the per-debate timeout: blitz forfeits at 120s, standard at 11m.
        const timeoutMs = d.blitz ? BLITZ_TIMEOUT_MS : TURN_TIMEOUT_MS;
        const startedMs = d.turn_started_at ? new Date(d.turn_started_at).getTime() : now;
        if (now - startedMs < timeoutMs) continue;

        const inactiveId = d.current_turn;
        if (!inactiveId || !d.player_b_id) continue;
        // Never forfeit the Oracle's turn — a transient Gemini outage shouldn't
        // cost it a turn. The Oracle-turn driver (step below) retries instead.
        if (inactiveId === ORACLE_USER_ID) continue;
        const opponentId =
            d.player_a_id === inactiveId ? d.player_b_id : d.player_a_id;
        if (!opponentId) continue;

        const { data: forfeitArg, error: insertError } = await serviceClient
            .from("arguments")
            .insert({
                debate_id: d.id,
                user_id: inactiveId,
                round_number: d.current_round,
                content: FORFEIT_TEXT,
                scoring_status: "done",
                score_total: 0,
                score_clarity: 0,
                score_evidence: 0,
                score_logic: 0,
                score_rebuttal: 0,
                fallacy_penalty: 0,
                fallacies_found: [],
                ai_feedback:
                    "Turn forfeited \u2014 no argument was submitted in time.",
            })
            .select()
            .single();

        if (insertError || !forfeitArg) continue;

        const { data: roundArgs } = await serviceClient
            .from("arguments")
            .select("id")
            .eq("debate_id", d.id)
            .eq("round_number", d.current_round);

        const isLastArgOfRound = (roundArgs?.length ?? 0) >= 2;
        const nextRound = isLastArgOfRound ? d.current_round + 1 : d.current_round;
        const isLastRound = d.current_round >= d.total_rounds;
        const isFinalSubmission = isLastArgOfRound && isLastRound;

        await serviceClient
            .from("debates")
            .update({
                current_turn: opponentId,
                current_round: nextRound,
                status: isFinalSubmission ? "scoring" : "active",
                turn_started_at: new Date().toISOString(),
            })
            .eq("id", d.id)
            .eq("status", "active"); // guard against concurrent real submission

        if (isFinalSubmission) {
            try {
                const { finalizeIfComplete } = await import("@/lib/debates/finalize");
                await finalizeIfComplete(serviceClient, d.id);
            } catch (e) {
                console.error("Forfeit finalize error:", e);
            }
        }
        // No per-turn email on a forfeit advance — per-turn emails were removed.
        // The opponent sees the forfeit instantly in the live room via realtime.

        processed.push(d.id);
    }

    return { forfeited: processed };
}

// ── Step 2: requeue stranded scoring ──────────────────────────────────
// Re-drive any argument left in pending/scoring past the stuck threshold. This
// is the free, cron-side backstop for a dropped scoring trigger (e.g. a mobile
// session that couldn't authenticate the original call). The score endpoint is
// idempotent and 'already scored' returns 200, so re-driving is always safe.
// Primary async-scoring path (ROADMAP Phase 2). claim_scoring_jobs() atomically
// claims a batch (FOR UPDATE SKIP LOCKED, also re-claiming jobs stuck in
// 'claimed') so concurrent cron runs never double-process. We drive /api/score
// for each; the score route deletes the job on a terminal state. Idempotent.
async function runDrainScoringQueue(origin: string): Promise<{ drained: string[] }> {
    const secret = process.env.CRON_SECRET ?? "";
    const { data: jobs, error } = await serviceClient.rpc("claim_scoring_jobs", {
        p_limit: 25,
        p_stale_seconds: 120,
    });

    if (error) {
        console.error("claim_scoring_jobs error:", error.message);
        return { drained: [] };
    }

    const drained: string[] = [];
    for (const j of (jobs ?? []) as { argument_id: string; user_id: string | null }[]) {
        try {
            await fetch(`${origin}/api/score`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": secret,
                },
                body: JSON.stringify({ argumentId: j.argument_id, userId: j.user_id }),
            });
            drained.push(j.argument_id);
        } catch (e) {
            console.error("Drain scoring job error:", e);
        }
    }

    return { drained };
}

async function runRequeueScoring(origin: string): Promise<{ requeued: string[] }> {
    const cutoff = new Date(Date.now() - STUCK_SCORING_MS).toISOString();

    const { data: stuck } = await serviceClient
        .from("arguments")
        .select("id, user_id, submitted_at")
        .in("scoring_status", ["pending", "scoring"])
        .lt("submitted_at", cutoff);

    const requeued: string[] = [];
    const secret = process.env.CRON_SECRET ?? "";

    for (const a of stuck ?? []) {
        try {
            await fetch(`${origin}/api/score`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": secret,
                },
                body: JSON.stringify({ argumentId: a.id, userId: a.user_id }),
            });
            requeued.push(a.id);
        } catch (e) {
            console.error("Requeue scoring error:", e);
        }
    }

    return { requeued };
}

// ── Step 2b: drive stranded Oracle turns ─────────────────────────────
// Free backstop for a dropped Oracle trigger: any active vs-Oracle debate
// currently on the Oracle's turn is re-driven. The oracle-turn route is
// idempotent (submit_argument rejects a duplicate round), so this is safe.
async function runDriveOracleTurns(origin: string): Promise<{ driven: string[] }> {
    const { data: pending } = await serviceClient
        .from("debates")
        .select("id")
        .eq("status", "active")
        .eq("player_b_id", ORACLE_USER_ID)
        .eq("current_turn", ORACLE_USER_ID);

    const driven: string[] = [];
    const secret = process.env.CRON_SECRET ?? "";

    for (const d of pending ?? []) {
        try {
            await fetch(`${origin}/api/debates/${d.id}/oracle-turn`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": secret,
                },
            });
            driven.push(d.id);
        } catch (e) {
            console.error("Drive oracle turn error:", e);
        }
    }

    return { driven };
}

// ── Step 3 & 4: cleanup waiting debates + resolve ghost active debates ─────
async function runCleanup(): Promise<{
    deleted: string[];
    ghostsResolved: string[];
    error?: string;
}> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stale, error: fetchError } = await serviceClient
        .from("debates")
        .select("id")
        .eq("status", "waiting")
        .lt("created_at", cutoff);

    if (fetchError) return { deleted: [], ghostsResolved: [], error: fetchError.message };

    const ids = (stale ?? []).map((d) => d.id);

    if (ids.length > 0) {
        // Delete arguments first (foreign key), then the debates.
        await serviceClient.from("arguments").delete().in("debate_id", ids);
        const { error: deleteError } = await serviceClient
            .from("debates")
            .delete()
            .in("id", ids);
        if (deleteError)
            return { deleted: [], ghostsResolved: [], error: deleteError.message };
    }

    // Resolve "ghost" active debates abandoned for 48h+. The player NOT on turn
    // (acted last) wins; if indeterminate we settle as a draw (null winner).
    const ghostCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: ghosts } = await serviceClient
        .from("debates")
        .select("id, player_a_id, player_b_id, current_turn")
        .eq("status", "active")
        .lt("created_at", ghostCutoff);

    const resolvedGhosts: string[] = [];
    for (const g of ghosts ?? []) {
        let winnerId: string | null = null;
        let loserId: string | null = null;
        if (g.current_turn && g.player_a_id && g.player_b_id) {
            winnerId =
                g.current_turn === g.player_a_id ? g.player_b_id : g.player_a_id;
            loserId = g.current_turn;
        }
        const settled = await forfeitDebate(serviceClient, g.id, winnerId, loserId);
        if (settled) resolvedGhosts.push(g.id);
    }

    return { deleted: ids, ghostsResolved: resolvedGhosts };
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const origin = new URL(request.url).origin;

    const forfeit = await runAutoForfeit();
    const oracle = await runDriveOracleTurns(origin);
    const drain = await runDrainScoringQueue(origin);
    const requeue = await runRequeueScoring(origin);
    const cleanup = await runCleanup();

    return NextResponse.json({
        autoForfeit: {
            forfeited: forfeit.forfeited.length,
            debateIds: forfeit.forfeited,
            error: forfeit.error,
        },
        oracleTurns: {
            driven: oracle.driven.length,
            debateIds: oracle.driven,
        },
        scoringQueue: {
            drained: drain.drained.length,
            argumentIds: drain.drained,
        },
        requeueScoring: {
            requeued: requeue.requeued.length,
            argumentIds: requeue.requeued,
        },
        cleanup: {
            deleted: cleanup.deleted.length,
            ids: cleanup.deleted,
            ghostsResolved: cleanup.ghostsResolved.length,
            ghostIds: cleanup.ghostsResolved,
            error: cleanup.error,
        },
    });
}
