import { createClient as createServiceClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { todayUtc } from "@/lib/dailyTopic";

// Per-topic Daily Topic leaderboard (ROADMAP Phase 3, item 5).
//
// Ranks everyone who has COMPLETED a debate on today's Daily Topic by their
// total argument score across those debates. The Daily Topic is identified by
// TITLE: the "Debate this" CTA creates a normal topic row with that title, and
// matchmaking/daily generation may create others, so we match every topic whose
// title equals today's daily title.
//
// Pure read feature — no migration. Aggregation is done in app code (Supabase
// has no GROUP BY over the REST client) over the day's debates, which is a
// small set. Cached for 2 min; refreshed sooner is unnecessary for a daily
// board. The Oracle system user is excluded from the ranking.

const ORACLE_USER_ID = "00000000-0000-0000-0000-0000000000a1";
const REVALIDATE_SECONDS = 120;

export interface DailyLeaderboardEntry {
    userId: string;
    username: string;
    score: number;
    debates: number;
    wins: number;
}

export interface DailyLeaderboard {
    date: string;
    title: string | null;
    category: string | null;
    entries: DailyLeaderboardEntry[];
}

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function buildDailyLeaderboard(): Promise<DailyLeaderboard> {
    const client = serviceClient();
    const date = todayUtc();

    const { data: daily } = await client
        .from("daily_topics")
        .select("title, category")
        .eq("date", date)
        .single();

    if (!daily) return { date, title: null, category: null, entries: [] };

    // All topic ids that share today's daily title.
    const { data: topics } = await client
        .from("topics")
        .select("id")
        .eq("title", daily.title);
    const topicIds = (topics ?? []).map((t) => t.id);
    if (topicIds.length === 0) {
        return { date, title: daily.title, category: daily.category, entries: [] };
    }

    // Completed debates on those topics.
    const { data: debates } = await client
        .from("debates")
        .select("id, player_a_id, player_b_id, winner_id")
        .in("topic_id", topicIds)
        .eq("status", "completed");
    const debateIds = (debates ?? []).map((d) => d.id);
    if (debateIds.length === 0) {
        return { date, title: daily.title, category: daily.category, entries: [] };
    }

    // Wins per user (from winner_id) and participation set.
    const winCount = new Map<string, number>();
    for (const d of debates ?? []) {
        if (d.winner_id) winCount.set(d.winner_id, (winCount.get(d.winner_id) ?? 0) + 1);
    }

    // Sum each player's argument scores across those debates.
    const { data: args } = await client
        .from("arguments")
        .select("user_id, score_total, debate_id")
        .in("debate_id", debateIds);

    const scoreByUser = new Map<string, number>();
    const debatesByUser = new Map<string, Set<string>>();
    for (const a of args ?? []) {
        if (!a.user_id || a.user_id === ORACLE_USER_ID) continue;
        scoreByUser.set(a.user_id, (scoreByUser.get(a.user_id) ?? 0) + (a.score_total ?? 0));
        if (!debatesByUser.has(a.user_id)) debatesByUser.set(a.user_id, new Set());
        debatesByUser.get(a.user_id)!.add(a.debate_id);
    }

    const userIds = Array.from(scoreByUser.keys());
    if (userIds.length === 0) {
        return { date, title: daily.title, category: daily.category, entries: [] };
    }

    const { data: users } = await client
        .from("users")
        .select("id, username")
        .in("id", userIds);
    const nameById = new Map((users ?? []).map((u) => [u.id, u.username]));

    const entries: DailyLeaderboardEntry[] = userIds
        .map((id) => ({
            userId: id,
            username: nameById.get(id) ?? "Unknown",
            score: scoreByUser.get(id) ?? 0,
            debates: debatesByUser.get(id)?.size ?? 0,
            wins: winCount.get(id) ?? 0,
        }))
        .sort((a, b) => b.score - a.score || b.wins - a.wins)
        .slice(0, 50);

    return { date, title: daily.title, category: daily.category, entries };
}

export const getDailyLeaderboard = unstable_cache(
    buildDailyLeaderboard,
    ["daily-leaderboard"],
    { revalidate: REVALIDATE_SECONDS, tags: ["daily-leaderboard"] }
);
