import type { SupabaseClient } from "@supabase/supabase-js";
import { settleResult } from "@/lib/debates/settle";

// Best-effort cache-tag invalidation for the leaderboard. Imported lazily and
// guarded so it never throws into the finalize path.
async function invalidateLeaderboard(): Promise<void> {
    try {
        const { revalidateTag } = await import("next/cache");
        revalidateTag("leaderboard", "max");
    } catch {
        /* non-critical: the 60s revalidate window will refresh it anyway */
    }
}

async function invalidateDailyLeaderboard(): Promise<void> {
    try {
        const { revalidateTag } = await import("next/cache");
        revalidateTag("daily-leaderboard", "max");
    } catch {
        /* non-critical: the 120s revalidate window will refresh it anyway */
    }
}

/**
 * Finalize a debate once every argument has reached a terminal scoring state.
 *
 * Terminal states are "done" (scored by the judge) and "failed" (scoring could
 * not complete after retries, or the content was rejected). A "failed"
 * argument counts as 0 points — the same value already written for forfeits —
 * so a single transient Gemini error can no longer strand a fully-played
 * debate in "scoring" forever (it previously waited for the 48h ghost cleanup,
 * which then wrongly settled it as a forfeit).
 *
 * Arguments still "pending" or "scoring" are genuinely in flight and block
 * finalization until they settle.
 *
 * Idempotent: only acts when the debate is in "scoring" status, guarded by a
 * conditional update so concurrent callers can't double-apply ratings.
 *
 * @returns true if the debate was finalized by this call.
 */
export async function finalizeIfComplete(
    client: SupabaseClient,
    debateId: string
): Promise<boolean> {
    const { data: allArgs } = await client
        .from("arguments")
        .select("user_id, score_total, scoring_status")
        .eq("debate_id", debateId);

    if (!allArgs || allArgs.length === 0) return false;

    // Every argument must be terminal (done or failed). Anything still pending
    // or scoring means the judge hasn't finished yet — don't finalize.
    const allSettled = allArgs.every(
        (a) => a.scoring_status === "done" || a.scoring_status === "failed"
    );
    if (!allSettled) return false;

    const { data: debate } = await client
        .from("debates")
        .select("status, player_a_id, player_b_id, mode")
        .eq("id", debateId)
        .single();

    if (!debate || debate.status !== "scoring") return false;

    const scoreA = allArgs
        .filter((a) => a.user_id === debate.player_a_id)
        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);
    const scoreB = allArgs
        .filter((a) => a.user_id === debate.player_b_id)
        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);

    const winnerId =
        scoreA > scoreB
            ? debate.player_a_id
            : scoreB > scoreA
                ? debate.player_b_id
                : null;

    // Mark completed only if still in scoring (idempotency guard).
    const { data: completed } = await client
        .from("debates")
        .update({ status: "completed", winner_id: winnerId })
        .eq("id", debateId)
        .eq("status", "scoring")
        .select("id")
        .single();

    if (!completed) return false; // another path finalized it first

    // Refresh the cached Daily Topic board (any mode/outcome, incl. draws).
    await invalidateDailyLeaderboard();

    if (!winnerId) return true;

    const loserId =
        winnerId === debate.player_a_id ? debate.player_b_id : debate.player_a_id;
    if (!loserId) return true;

    // Shared settlement (Elo + stats + elo_history) — identical math used by the
    // forfeit path, so the two can never drift.
    await settleResult(client, debateId, debate.mode, winnerId, loserId);

    // Elo changed on a ranked result — refresh the cached leaderboard first page
    // promptly. Best-effort: revalidateTag only runs in a server context, so a
    // failure must not break finalization.
    if (debate.mode === "ranked") {
        await invalidateLeaderboard();
    }

    return true;
}
