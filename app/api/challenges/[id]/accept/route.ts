import { createClient } from "@/lib/supabase/server";
import { backfillIpHash, flagSybilDebate } from "@/lib/safety/fingerprint";
import { sendMatchNotification } from "@/lib/email/resend";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Anti-Sybil: record this user's hashed IP on first sight (no-op if set).
    await backfillIpHash(supabase, user.id, request);

    const { data: challenge, error: challengeError } = await supabase
        .from("challenges")
        .select("id, creator_id, topic_id, status")
        .eq("id", id)
        .single();

    if (challengeError || !challenge)
        return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    if (challenge.status !== "open")
        return NextResponse.json({ error: "This challenge is no longer open." }, { status: 409 });

    if (challenge.creator_id === user.id)
        return NextResponse.json({ error: "You cannot accept your own challenge." }, { status: 400 });

    // Create the debate
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

    if (debateError || !debate)
        return NextResponse.json(
            { error: debateError?.message ?? "Failed to create debate." },
            { status: 500 }
        );

    // Mark challenge accepted AND store the debate_id so the creator can be redirected
    const { data: claimed } = await supabase
        .from("challenges")
        .update({ status: "accepted", debate_id: debate.id })
        .eq("id", id)
        .eq("status", "open")
        .select("id")
        .single();

    if (!claimed) {
        // Race condition — someone else accepted first
        await supabase.from("debates").delete().eq("id", debate.id);
        return NextResponse.json(
            { error: "This challenge was just accepted by someone else." },
            { status: 409 }
        );
    }

    // Soft Sybil flag: marks the debate for review if both players share an IP
    // hash. No-op otherwise. Never blocks play.
    await flagSybilDebate(supabase, debate.id);

    // One connection email to BOTH players now that the challenge is accepted
    // and the debate is live (fire-and-forget; no-op without RESEND_API_KEY).
    sendMatchNotification(debate.id).catch(() => { });

    return NextResponse.json({ debateId: debate.id });
}