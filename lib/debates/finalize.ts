import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateElo } from "@/lib/ai/elo";

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

    if (!winnerId) return true;

    const loserId =
        winnerId === debate.player_a_id ? debate.player_b_id : debate.player_a_id;
    if (!loserId) return true;

    if (debate.mode === "ranked") {
        const { data: winner } = await client
            .from("users")
            .select("elo_rating, debates_won, debates_lost")
            .eq("id", winnerId)
            .single();
        const { data: loser } = await client
            .from("users")
            .select("elo_rating, debates_won, debates_lost")
            .eq("id", loserId)
            .single();

        if (winner && loser) {
            // K-factor is driven by TOTAL games played (wins + losses), not just
            // wins/losses. Using one half understates experience and keeps
            // established players on the high-volatility K.
            const winnerGames = (winner.debates_won ?? 0) + (winner.debates_lost ?? 0);
            const loserGames = (loser.debates_won ?? 0) + (loser.debates_lost ?? 0);
            const { newWinnerElo, newLoserElo } = calculateElo(
                winner.elo_rating,
                loser.elo_rating,
                winnerGames,
                loserGames
            );

            await client
                .from("users")
                .update({ elo_rating: newWinnerElo, debates_won: (winner.debates_won ?? 0) + 1 })
                .eq("id", winnerId);
            await client
                .from("users")
                .update({ elo_rating: newLoserElo, debates_lost: (loser.debates_lost ?? 0) + 1 })
                .eq("id", loserId);

            await client.from("elo_history").insert([
                { user_id: winnerId, debate_id: debateId, elo_before: winner.elo_rating, elo_after: newWinnerElo },
                { user_id: loserId, debate_id: debateId, elo_before: loser.elo_rating, elo_after: newLoserElo },
            ]);
        }
    } else if (debate.mode === "casual") {
        const { data: w } = await client.from("users").select("debates_won").eq("id", winnerId).single();
        const { data: l } = await client.from("users").select("debates_lost").eq("id", loserId).single();
        await client.from("users").update({ debates_won: (w?.debates_won ?? 0) + 1 }).eq("id", winnerId);
        await client.from("users").update({ debates_lost: (l?.debates_lost ?? 0) + 1 }).eq("id", loserId);
    }

    return true;
}
