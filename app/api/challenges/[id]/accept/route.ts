import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { backfillIpHash, flagSybilDebate } from "@/lib/safety/fingerprint";
import { sendMatchNotification } from "@/lib/email/resend";
import { createNotification } from "@/lib/notifications";
import { sendPush } from "@/lib/push/send";
import { NextResponse } from "next/server";

// Service-role client for the creator notification insert (bypasses RLS; end
// users can only read their own notifications). Fail-open everywhere.
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Select the persistent-challenge columns too; if they don't exist yet
    // (pre-0018) this errors, so fall back to the minimal column set.
    let challenge: {
        id: string; creator_id: string; topic_id: string; status: string;
        reusable?: boolean; rounds?: number; blitz?: boolean;
    } | null = null;
    {
        const full = await supabase
            .from("challenges")
            .select("id, creator_id, topic_id, status, reusable, rounds, blitz")
            .eq("id", id)
            .single();
        if (full.error) {
            const min = await supabase
                .from("challenges")
                .select("id, creator_id, topic_id, status")
                .eq("id", id)
                .single();
            challenge = min.data;
        } else {
            challenge = full.data;
        }
    }

    if (!challenge)
        return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    if (challenge.status !== "open")
        return NextResponse.json({ error: "This challenge is no longer open." }, { status: 409 });

    if (challenge.creator_id === user.id)
        return NextResponse.json({ error: "You cannot accept your own challenge." }, { status: 400 });

    // Create the debate using the challenge's stored format (rounds/blitz),
    // falling back to today's defaults when those columns are absent (pre-0018).
    const totalRounds = [2, 3, 4, 5].includes(challenge.rounds ?? 3) ? (challenge.rounds ?? 3) : 3;
    const isBlitz = challenge.blitz === true;
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
            total_rounds: totalRounds,
            is_public: true,
            blitz: isBlitz,
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

    // In-app notification to the CREATOR that someone joined (ROADMAP 2.4
    // item 2). Fail-open: never blocks the join. Look up the joiner's name for
    // a friendlier message; fall back to a generic one.
    try {
        const { data: joiner } = await supabase
            .from("users")
            .select("username")
            .eq("id", user.id)
            .single();
        const who = joiner?.username ? `@${joiner.username}` : "Someone";
        await createNotification(serviceClient, {
            recipientId: challenge.creator_id,
            type: "challenge_join",
            title: `${who} joined your challenge`,
            body: "Your debate is live — it's your turn to open.",
            link: `/debate/${debate.id}`,
        });
        // Best-effort web push alongside the in-app bell (ROADMAP 2.4 item 3).
        // Fire-and-forget; no-ops entirely if push isn't configured/installed.
        sendPush(challenge.creator_id, {
            title: `${who} joined your challenge`,
            body: "Your debate is live — it's your turn to open.",
            url: `/debate/${debate.id}`,
        }).catch(() => { });
    } catch {
        /* fail-open — a missing notification must never break the join */
    }

    return NextResponse.json({ debateId: debate.id });
}