import { createClient as createServiceClient } from "@supabase/supabase-js";

// Server-side matchmaking core (#6). Uses the service-role client so it can
// read other users' queue rows and create the debate regardless of RLS.

const MATCH_TOPICS = [
    { title: "Social media does more harm than good", category: "Culture" },
    { title: "AI will eliminate more jobs than it creates", category: "Technology" },
    { title: "Universal basic income should be implemented globally", category: "Politics" },
    { title: "Space exploration is worth the cost", category: "Science" },
    { title: "Free will is an illusion", category: "Philosophy" },
    { title: "Remote work is better than office work", category: "Culture" },
    { title: "Nuclear energy is essential to fighting climate change", category: "Science" },
];

export interface MatchResult {
    matched: boolean;
    debateId?: string;
}

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// Elo band as a function of how long the *waiting* player has been queued.
function bandForWait(waitedMs: number): number {
    const s = waitedMs / 1000;
    if (s <= 60) return 200;
    if (s <= 180) return 500;
    return Number.POSITIVE_INFINITY;
}

/**
 * Attempt to match the given user against another waiting player.
 * Idempotent and race-safe: the debate + both queue updates only commit if
 * both rows are still "waiting" at write time.
 */
export async function attemptMatch(userId: string): Promise<MatchResult> {
    const client = serviceClient();

    const { data: me } = await client
        .from("matchmaking_queue")
        .select("user_id, elo_rating, status, joined_at, matched_debate_id")
        .eq("user_id", userId)
        .single();

    if (!me) return { matched: false };
    if (me.status === "matched" && me.matched_debate_id) {
        return { matched: true, debateId: me.matched_debate_id };
    }
    if (me.status !== "waiting") return { matched: false };

    const myElo = me.elo_rating ?? 1200;
    const myWait = me.joined_at ? Date.now() - new Date(me.joined_at).getTime() : 0;

    // Candidate opponents: everyone else waiting, closest Elo first.
    const { data: candidates } = await client
        .from("matchmaking_queue")
        .select("user_id, elo_rating, joined_at, status")
        .eq("status", "waiting")
        .neq("user_id", userId);

    if (!candidates || candidates.length === 0) return { matched: false };

    const ranked = candidates
        .map((c) => {
            const theirWait = c.joined_at ? Date.now() - new Date(c.joined_at).getTime() : 0;
            // Use the more generous band of the two waiters so a long-waiting
            // player can be matched even by a fresh arrival.
            const band = Math.max(bandForWait(myWait), bandForWait(theirWait));
            return { ...c, diff: Math.abs((c.elo_rating ?? 1200) - myElo), band };
        })
        .filter((c) => c.diff <= c.band)
        .sort((a, b) => a.diff - b.diff);

    const opponent = ranked[0];
    if (!opponent) return { matched: false };

    // Pick a topic + create it.
    const topic = MATCH_TOPICS[Math.floor(Math.random() * MATCH_TOPICS.length)];
    const { data: topicRow, error: topicErr } = await client
        .from("topics")
        .insert({ title: topic.title, category: topic.category, source: "matchmaking" })
        .select()
        .single();
    if (topicErr || !topicRow) return { matched: false };

    // Lower user_id is player A (FOR) — deterministic side assignment.
    const [playerA, playerB] =
        userId < opponent.user_id ? [userId, opponent.user_id] : [opponent.user_id, userId];

    const { data: debate, error: debateErr } = await client
        .from("debates")
        .insert({
            topic_id: topicRow.id,
            player_a_id: playerA,
            player_b_id: playerB,
            player_a_side: "FOR",
            mode: "ranked",
            status: "active",
            current_turn: playerA,
            current_round: 1,
            total_rounds: 3,
            is_public: true,
            turn_started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (debateErr || !debate) {
        await client.from("topics").delete().eq("id", topicRow.id);
        return { matched: false };
    }

    // Claim BOTH queue rows, only if still waiting. If either claim fails
    // (someone matched concurrently), roll the debate back.
    const claim = async (uid: string) =>
        client
            .from("matchmaking_queue")
            .update({ status: "matched", matched_debate_id: debate.id })
            .eq("user_id", uid)
            .eq("status", "waiting")
            .select("user_id")
            .single();

    const { data: claimedMe } = await claim(userId);
    const { data: claimedOpp } = await claim(opponent.user_id);

    if (!claimedMe || !claimedOpp) {
        // Roll back: release any row we did claim, delete the debate + topic.
        if (claimedMe) {
            await client
                .from("matchmaking_queue")
                .update({ status: "waiting", matched_debate_id: null })
                .eq("user_id", userId);
        }
        if (claimedOpp) {
            await client
                .from("matchmaking_queue")
                .update({ status: "waiting", matched_debate_id: null })
                .eq("user_id", opponent.user_id);
        }
        await client.from("debates").delete().eq("id", debate.id);
        await client.from("topics").delete().eq("id", topicRow.id);
        return { matched: false };
    }

    return { matched: true, debateId: debate.id };
}
