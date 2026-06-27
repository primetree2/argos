import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateElo } from "@/lib/ai/elo";

// Single authoritative implementation of result settlement (Elo + win/loss
// stats + elo_history). Both the normal-completion path (finalizeIfComplete)
// and the forfeit/resign path (forfeitDebate) call this, so the rating logic
// lives in exactly ONE place. Previously each file duplicated it and had to be
// kept in sync by hand.
//
// This function is NON-transactional and does NOT flip debate status — callers
// own the idempotent conditional status update (the concurrency guard) and only
// invoke this after they have successfully claimed the completion. Pass a
// SERVICE-ROLE client: updating both users' stats/Elo crosses user boundaries
// that RLS blocks for the anon/SSR client.
//
// A null winnerId (a draw) settles no Elo or stats — the caller has already
// recorded winner_id = null on the debate.
export async function settleResult(
    client: SupabaseClient,
    debateId: string,
    mode: string,
    winnerId: string | null,
    loserId: string | null
): Promise<void> {
    if (!winnerId || !loserId) return;

    if (mode === "ranked") {
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

        if (!winner || !loser) return;

        // K-factor is driven by TOTAL games played (wins + losses), not just one
        // half, so established players stay on the correct volatility band.
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
        return;
    }

    // Casual: win/loss counts only, no Elo.
    const { data: w } = await client.from("users").select("debates_won").eq("id", winnerId).single();
    const { data: l } = await client.from("users").select("debates_lost").eq("id", loserId).single();
    await client.from("users").update({ debates_won: (w?.debates_won ?? 0) + 1 }).eq("id", winnerId);
    await client.from("users").update({ debates_lost: (l?.debates_lost ?? 0) + 1 }).eq("id", loserId);
}
