import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateElo } from "@/lib/ai/elo";

/**
 * Forfeit/resign an entire debate, declaring `winnerId` the victor regardless
 * of accumulated argument scores. Used by the resign route and by cleanup of
 * stuck "ghost" debates.
 *
 * IMPORTANT: pass a SERVICE-ROLE client. Updating the opponent's stats and Elo
 * crosses user boundaries, which RLS blocks for the anon/SSR client.
 *
 * Idempotent: only acts on debates that are not already `completed`, guarded by
 * a conditional update so concurrent callers cannot double-apply rating changes.
 *
 * @returns true if this call settled the debate.
 */
export async function forfeitDebate(
    client: SupabaseClient,
    debateId: string,
    winnerId: string | null,
    loserId: string | null
): Promise<boolean> {
    const { data: debate } = await client
        .from("debates")
        .select("status, mode")
        .eq("id", debateId)
        .single();

    if (!debate || debate.status === "completed") return false;

    // Conditional update is the concurrency guard: only the caller that flips
    // the row away from its current non-completed status proceeds to settle.
    const { data: completed } = await client
        .from("debates")
        .update({ status: "completed", winner_id: winnerId })
        .eq("id", debateId)
        .neq("status", "completed")
        .select("id")
        .single();

    if (!completed) return false; // another path already finalized it

    if (!winnerId || !loserId) return true;

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
            // K-factor uses TOTAL games played (wins + losses), not just wins/losses.
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
    } else {
        const { data: w } = await client.from("users").select("debates_won").eq("id", winnerId).single();
        const { data: l } = await client.from("users").select("debates_lost").eq("id", loserId).single();
        await client.from("users").update({ debates_won: (w?.debates_won ?? 0) + 1 }).eq("id", winnerId);
        await client.from("users").update({ debates_lost: (l?.debates_lost ?? 0) + 1 }).eq("id", loserId);
    }

    return true;
}
