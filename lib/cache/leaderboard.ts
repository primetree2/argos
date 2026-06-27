import { createClient as createServiceClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

// Cached read path for the leaderboard (ROADMAP Phase 2, item 3).
//
// The first page of the leaderboard is identical for every viewer and changes
// only when an Elo settles, so it is wasteful to hit Postgres on every view.
// We wrap the public query in unstable_cache with a short revalidate window and
// a cache tag, so repeated views are served from the Next data cache instead of
// the database. This is user-INDEPENDENT data only — the page still renders the
// per-user navbar dynamically via auth.getUser(), which this does not touch.
//
// A service-role client is used so the cached function has no per-request
// (cookie) dependency; the data returned is public regardless.

export interface LeaderboardRow {
    id: string;
    username: string;
    elo_rating: number | null;
    debates_won: number | null;
    debates_lost: number | null;
}

export interface LeaderboardPage {
    players: LeaderboardRow[];
    count: number;
}

const PAGE_SIZE = 50;
// Revalidate window: leaderboard freshness of ~1 min is plenty and slashes
// repeated DB reads under load.
const REVALIDATE_SECONDS = 60;

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// Uncached query for an arbitrary page (used for deep pages, which are rare).
export async function fetchLeaderboardPage(page: number): Promise<LeaderboardPage> {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await serviceClient()
        .from("users")
        .select("id, username, elo_rating, debates_won, debates_lost", { count: "exact" })
        .order("elo_rating", { ascending: false })
        .range(from, to);
    return { players: (data as LeaderboardRow[] | null) ?? [], count: count ?? 0 };
}

// Cached first page — where almost all traffic lands.
export const getLeaderboardFirstPage = unstable_cache(
    async (): Promise<LeaderboardPage> => fetchLeaderboardPage(1),
    ["leaderboard-page-1"],
    { revalidate: REVALIDATE_SECONDS, tags: ["leaderboard"] }
);

export const LEADERBOARD_PAGE_SIZE = PAGE_SIZE;
