import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Audience voting (ROADMAP Phase 3, item 2). Writes to spectator_votes (0011).
//
//   GET  ?debateId=...                 -> { tallies: {round: {player_a, player_b}},
//                                           mine: {round: 'player_a'|'player_b'} }
//   POST { debateId, round, side }      -> toggle/switch the caller's vote
//
// Only NON-participants may vote (players can't pad the crowd tally). Voting is
// allowed on public debates in any non-waiting state. RLS restricts writes to
// the caller's own rows; we use the authed client so auth.uid() is set.

const VALID_SIDES = new Set(["player_a", "player_b"]);

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const debateId = searchParams.get("debateId");
    if (!debateId) {
        return NextResponse.json({ error: "Missing debateId" }, { status: 400 });
    }

    const { data: votes } = await supabase
        .from("spectator_votes")
        .select("user_id, round_number, side")
        .eq("debate_id", debateId);

    // tallies[round][side] = count ; mine[round] = side chosen by the caller
    const tallies: Record<number, { player_a: number; player_b: number }> = {};
    const mine: Record<number, string> = {};

    for (const v of votes ?? []) {
        tallies[v.round_number] ??= { player_a: 0, player_b: 0 };
        if (v.side === "player_a" || v.side === "player_b") {
            tallies[v.round_number][v.side] += 1;
        }
        if (user && v.user_id === user.id) mine[v.round_number] = v.side;
    }

    return NextResponse.json({ tallies, mine });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { debateId, round, side } = await request.json();
    if (typeof debateId !== "string" || !VALID_SIDES.has(side) || !Number.isInteger(round)) {
        return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }

    // Verify debate is public and not in the waiting (pre-start) state, and that
    // the caller is NOT one of the two players.
    const { data: debate } = await supabase
        .from("debates")
        .select("status, is_public, player_a_id, player_b_id")
        .eq("id", debateId)
        .single();

    if (!debate || debate.is_public === false || debate.status === "waiting") {
        return NextResponse.json(
            { error: "Voting is not available for this debate." },
            { status: 403 }
        );
    }
    if (debate.player_a_id === user.id || debate.player_b_id === user.id) {
        return NextResponse.json(
            { error: "Participants cannot vote in their own debate." },
            { status: 403 }
        );
    }

    // Toggle/switch behaviour, scoped to (debate, user, round).
    const { data: existing } = await supabase
        .from("spectator_votes")
        .select("id, side")
        .eq("debate_id", debateId)
        .eq("user_id", user.id)
        .eq("round_number", round)
        .maybeSingle();

    if (existing) {
        if (existing.side === side) {
            await supabase.from("spectator_votes").delete().eq("id", existing.id);
            return NextResponse.json({ state: "removed", side });
        }
        await supabase
            .from("spectator_votes")
            .update({ side })
            .eq("id", existing.id);
        return NextResponse.json({ state: "switched", side });
    }

    const { error } = await supabase
        .from("spectator_votes")
        .insert({ debate_id: debateId, user_id: user.id, round_number: round, side });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ state: "added", side });
}
