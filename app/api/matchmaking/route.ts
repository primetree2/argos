import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { attemptMatch } from "@/lib/matchmaking";
import { checkRateLimit } from "@/lib/rateLimit";
import { backfillIpHash, flagSybilDebate } from "@/lib/safety/fingerprint";

// Rate limit: matchmaking attempts per user. The client polls GET every ~4s,
// so 30/60s leaves comfortable headroom for legitimate use while throttling
// scripted ranked-match spam (anti-Sybil leverage, ROADMAP Phase 1, items 5-6).
const MM_LIMIT = 30;
const MM_WINDOW_SECONDS = 60;

// Ranked matchmaking queue (#6).
//
//  POST   — join the queue, then immediately try to match.
//  GET    — poll own status; re-attempts a match (widening band over time).
//  DELETE — leave the queue.
//
// Pairing rule: two waiting players within an Elo band are matched. The band
// widens with the *older* player's wait time:
//   <= 60s  → 200 pts
//   <= 180s → 500 pts
//   > 180s  → unlimited

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await checkRateLimit(supabase, `mm:${user.id}`, MM_LIMIT, MM_WINDOW_SECONDS))) {
        return NextResponse.json(
            { error: "Too many matchmaking requests. Slow down a moment." },
            { status: 429 }
        );
    }

    // Anti-Sybil: record this user's hashed IP on first sight (no-op if set).
    await backfillIpHash(supabase, user.id, request);

    const { data: profile } = await supabase
        .from("users")
        .select("elo_rating")
        .eq("id", user.id)
        .single();
    const elo = profile?.elo_rating ?? 1200;

    // Upsert this user into the queue as waiting. unique(user_id) keeps it idempotent.
    const { error: upsertError } = await supabase
        .from("matchmaking_queue")
        .upsert(
            {
                user_id: user.id,
                elo_rating: elo,
                status: "waiting",
                matched_debate_id: null,
                joined_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

    if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const result = await attemptMatch(user.id);
    if (result.matched && result.debateId) {
        await flagSybilDebate(supabase, result.debateId);
    }
    return NextResponse.json(result);
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await checkRateLimit(supabase, `mm:${user.id}`, MM_LIMIT, MM_WINDOW_SECONDS))) {
        return NextResponse.json(
            { error: "Too many matchmaking requests. Slow down a moment." },
            { status: 429 }
        );
    }

    // If someone already matched us, report it.
    const { data: row } = await supabase
        .from("matchmaking_queue")
        .select("status, matched_debate_id, joined_at")
        .eq("user_id", user.id)
        .single();

    if (!row) return NextResponse.json({ inQueue: false, matched: false });
    if (row.status === "matched" && row.matched_debate_id) {
        return NextResponse.json({ inQueue: true, matched: true, debateId: row.matched_debate_id });
    }

    // Still waiting — re-attempt (band may have widened since we joined).
    const result = await attemptMatch(user.id);
    if (result.matched && result.debateId) {
        await backfillIpHash(supabase, user.id, request);
        await flagSybilDebate(supabase, result.debateId);
    }
    const waitedMs = row.joined_at ? Date.now() - new Date(row.joined_at).getTime() : 0;
    return NextResponse.json({ inQueue: true, waitedMs, ...result });
}

export async function DELETE() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Only remove our own row if it is still waiting (don't delete a match).
    await supabase
        .from("matchmaking_queue")
        .delete()
        .eq("user_id", user.id)
        .eq("status", "waiting");

    return NextResponse.json({ left: true });
}
