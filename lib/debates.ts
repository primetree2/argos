import type { SupabaseClient } from "@supabase/supabase-js";

export interface DebateHistoryEntry {
    id: string;
    topic: string;
    opponent: string | null;
    result: "won" | "lost" | "draw" | "active";
    createdAt: string | null;
}

/**
 * Fetch a user's recent debates with topic title, opponent username and outcome.
 * Used by the dashboard Chronicle section and the public profile page.
 */
export async function fetchDebateHistory(
    supabase: SupabaseClient,
    userId: string,
    limit = 10
): Promise<DebateHistoryEntry[]> {
    const { data: debates } = await supabase
        .from("debates")
        .select("id, player_a_id, player_b_id, winner_id, status, created_at, topics (title)")
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (!debates || debates.length === 0) return [];

    const opponentIds = Array.from(
        new Set(
            debates
                .map((d) => (d.player_a_id === userId ? d.player_b_id : d.player_a_id))
                .filter((id): id is string => Boolean(id))
        )
    );

    const opponentMap = new Map<string, string>();
    if (opponentIds.length > 0) {
        const { data: opponents } = await supabase
            .from("users")
            .select("id, username")
            .in("id", opponentIds);
        for (const o of opponents ?? []) opponentMap.set(o.id, o.username);
    }

    return debates.map((d) => {
        const opponentId = d.player_a_id === userId ? d.player_b_id : d.player_a_id;
        const topic = d.topics as unknown as { title: string } | null;

        let result: DebateHistoryEntry["result"];
        if (d.status !== "completed") result = "active";
        else if (d.winner_id === userId) result = "won";
        else if (d.winner_id) result = "lost";
        else result = "draw";

        return {
            id: d.id,
            topic: topic?.title ?? "Unknown topic",
            opponent: opponentId ? opponentMap.get(opponentId) ?? null : null,
            result,
            createdAt: d.created_at,
        };
    });
}
