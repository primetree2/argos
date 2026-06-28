import type { SupabaseClient } from "@supabase/supabase-js";

// Shared open-challenges reader (ROADMAP 2.4 item 2 follow-up).
//
// Used by the dashboard discovery panel. Mirrors the lobby page's shape but is
// reusable + fail-open: it selects the persistent-challenge columns and falls
// back to a minimal select if they don't exist yet (pre-0018), excludes the
// viewer's own challenges (you can't accept your own), and resolves creator
// usernames/Elo in one batched query. Returns [] on any error.

export interface OpenChallengeSummary {
    id: string;
    topicTitle: string;
    category: string | null;
    creator: string | null;
    creatorElo: number | null;
    rounds: number;
    blitz: boolean;
    reusable: boolean;
}

export async function fetchOpenChallenges(
    supabase: SupabaseClient,
    viewerId: string,
    limit = 4
): Promise<OpenChallengeSummary[]> {
    try {
        // Pull a few extra so we can drop the viewer's own and still fill the panel.
        const fetchLimit = limit + 6;

        type Row = {
            id: string; creator_id: string; status: string;
            reusable?: boolean; rounds?: number; blitz?: boolean;
            topics: { title: string; category: string | null } | null;
        };

        let rows: Row[] | null = null;
        const full = await supabase
            .from("challenges")
            .select("id, creator_id, status, reusable, rounds, blitz, topics (title, category)")
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(fetchLimit);
        if (full.error) {
            const min = await supabase
                .from("challenges")
                .select("id, creator_id, status, topics (title, category)")
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(fetchLimit);
            rows = (min.data as unknown as Row[]) ?? null;
        } else {
            rows = (full.data as unknown as Row[]) ?? null;
        }

        if (!rows || rows.length === 0) return [];

        // Exclude the viewer's own challenges, then cap.
        const others = rows.filter((r) => r.creator_id !== viewerId).slice(0, limit);
        if (others.length === 0) return [];

        const creatorIds = Array.from(
            new Set(others.map((r) => r.creator_id).filter((cid): cid is string => Boolean(cid)))
        );
        const creatorMap = new Map<string, { username: string; elo: number | null }>();
        if (creatorIds.length > 0) {
            const { data: creators } = await supabase
                .from("users")
                .select("id, username, elo_rating")
                .in("id", creatorIds);
            for (const c of creators ?? []) {
                creatorMap.set(c.id, { username: c.username, elo: c.elo_rating });
            }
        }

        return others.map((r) => {
            const topic = r.topics as unknown as { title: string; category: string | null } | null;
            const creator = r.creator_id ? creatorMap.get(r.creator_id) ?? null : null;
            return {
                id: r.id,
                topicTitle: topic?.title ?? "Unknown topic",
                category: topic?.category ?? null,
                creator: creator?.username ?? null,
                creatorElo: creator?.elo ?? null,
                rounds: typeof r.rounds === "number" ? r.rounds : 3,
                blitz: r.blitz === true,
                reusable: r.reusable === true,
            };
        });
    } catch {
        return [];
    }
}
