import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { moderateContent } from "@/lib/moderation";
import { getOrCreateTopic } from "@/lib/topics";

// POST /api/challenges — post an open public challenge with a chosen topic.
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { topic, category, reusable, rounds, blitz } = await request.json();

    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
        return NextResponse.json({ error: "Enter a topic to post a challenge." }, { status: 400 });
    }

    const mod = moderateContent(topic);
    if (!mod.allowed) return NextResponse.json({ error: mod.reason }, { status: 400 });

    // Persistent-challenge options (migration 0018). Coerced + bounded here;
    // harmless if the columns don't exist yet (Postgres ignores unknown keys?
    // no — so we only include them when present, see insert below).
    const isReusable = reusable === true;
    const isBlitz = blitz === true;
    const resolvedRounds = [2, 3, 4, 5].includes(rounds) ? rounds : 3;

    // Reuse an existing topic row for this title (unique constraint from 0004),
    // mirroring match_player — a blind insert would throw on a repeated title.
    const { data: topicData, error: topicError } = await getOrCreateTopic(
        supabase,
        topic.trim(),
        { category: category ?? null, source: "user" }
    );

    if (topicError || !topicData) {
        return NextResponse.json(
            { error: topicError ?? "Could not create topic." },
            { status: 500 }
        );
    }

    // Try inserting WITH the persistent-challenge columns first. If the table
    // predates migration 0018, that insert errors on the unknown columns, so we
    // transparently fall back to the original minimal insert — keeping the route
    // fully runnable before OR after 0018 is applied.
    let challenge;
    let challengeError;
    ({ data: challenge, error: challengeError } = await supabase
        .from("challenges")
        .insert({
            creator_id: user.id,
            topic_id: topicData.id,
            status: "open",
            reusable: isReusable,
            rounds: resolvedRounds,
            blitz: isBlitz,
        })
        .select()
        .single());

    if (challengeError) {
        ({ data: challenge, error: challengeError } = await supabase
            .from("challenges")
            .insert({ creator_id: user.id, topic_id: topicData.id, status: "open" })
            .select()
            .single());
    }

    if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 });

    return NextResponse.json({ challenge, topic: { id: topicData.id, title: topic.trim() } });
}

// DELETE /api/challenges?id=<challenge_id> — creator withdraws their own challenge.
export async function DELETE(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Challenge ID required." }, { status: 400 });

    // Verify the caller owns this challenge before deleting
    const { data: challenge } = await supabase
        .from("challenges")
        .select("creator_id, status")
        .eq("id", id)
        .single();

    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    if (challenge.creator_id !== user.id) return NextResponse.json({ error: "Not your challenge." }, { status: 403 });
    if (challenge.status !== "open") return NextResponse.json({ error: "Challenge already accepted." }, { status: 409 });

    const { error } = await supabase.from("challenges").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true });
}