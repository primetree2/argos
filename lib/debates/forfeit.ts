import type { SupabaseClient } from "@supabase/supabase-js";
import { settleResult } from "@/lib/debates/settle";

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

    await settleResult(client, debateId, debate.mode, winnerId, loserId);
    return true;
}
