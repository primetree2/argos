import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/challenges/[id]/accept
// Accepts an open challenge: creates an active debate between the challenge
// creator (player A, side FOR) and the accepting user (player B), marks the
// challenge accepted, and returns the new debate id so the client can redirect.
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load the challenge and ensure it is still open.
    const { data: challenge, error: challengeError } = await supabase
        .from("challenges")
        .select("id, creator_id, topic_id, status")
        .eq("id", id)
        .single();

    if (challengeError || !challenge) {
        return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (challenge.status !== "open") {
        return NextResponse.json({ error: "This challenge is no longer open." }, { status: 409 });
    }

    if (challenge.creator_id === user.id) {
        return NextResponse.json({ error: "You cannot accept your own challenge." }, { status: 400 });
    }

    // Create the debate: creator argues FOR, accepter argues AGAINST.
    // Creator takes the first turn, matching the manual-invite flow.
    const { data: debate, error: debateError } = await supabase
        .from("debates")
        .insert({
            topic_id: challenge.topic_id,
            player_a_id: challenge.creator_id,
            player_b_id: user.id,
            player_a_side: "FOR",
            mode: "ranked",
            status: "active",
            current_turn: challenge.creator_id,
            current_round: 1,
            total_rounds: 3,
            is_public: true,
            turn_started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (debateError || !debate) {
        return NextResponse.json(
            { error: debateError?.message ?? "Failed to create debate." },
            { status: 500 }
        );
    }

    // Mark the challenge accepted. Guard against a race where another user
    // accepted first: only flip it if it is still open.
    const { data: claimed } = await supabase
        .from("challenges")
        .update({ status: "accepted" })
        .eq("id", id)
        .eq("status", "open")
        .select("id")
        .single();

    if (!claimed) {
        // Someone beat us to it — roll back the debate we just created.
        await supabase.from("debates").delete().eq("id", debate.id);
        return NextResponse.json(
            { error: "This challenge was just accepted by someone else." },
            { status: 409 }
        );
    }

    return NextResponse.json({ debateId: debate.id });
}
