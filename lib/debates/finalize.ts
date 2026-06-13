import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Finalize a debate if every argument has been scored.
 *
 * This mirrors the completion + Elo logic in /api/score so that paths which
 * complete a debate without going through the judge (e.g. the auto-forfeit
 * cron, where the final argument is a pre-scored 0) can still settle the
 * result and update ratings. It is intentionally idempotent: it only acts when
 * the debate is in "scoring" status and all arguments are "done".
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
    const allScored = allArgs.every((a) => a.scoring_status === "done");
    if (!allScored) return false;

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
            .select("elo_rating, debates_won")
            .eq("id", winnerId)
            .single();
        const { data: loser } = await client
            .from("users")
            .select("elo_rating, debates_lost")
            .eq("id", loserId)
            .single();

        if (winner && loser) {
            const winnerGames = winner.debates_won ?? 0;
            const loserGames = loser.debates_lost ?? 0;
            const kFactor = (games: number) => (games < 30 ? 32 : 16);
            const expectedWinner =
                1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
            const newWinnerElo = Math.round(
                winner.elo_rating + kFactor(winnerGames) * (1 - expectedWinner)
            );
            const newLoserElo = Math.round(
                loser.elo_rating + kFactor(loserGames) * (0 - (1 - expectedWinner))
            );

            await client
                .from("users")
                .update({ elo_rating: newWinnerElo, debates_won: winnerGames + 1 })
                .eq("id", winnerId);
            await client
                .from("users")
                .update({ elo_rating: newLoserElo, debates_lost: loserGames + 1 })
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
