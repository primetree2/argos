import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { moderateContent } from "@/lib/moderation";

// POST /api/challenges — post an open public challenge with a chosen topic.
export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topic, category } = await request.json();

    if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
        return NextResponse.json({ error: "Enter a topic to post a challenge." }, { status: 400 });
    }

    // Reuse the same moderation gate used on argument submission.
    const mod = moderateContent(topic);
    if (!mod.allowed) {
        return NextResponse.json({ error: mod.reason }, { status: 400 });
    }

    // Create the topic first (mirrors /api/debates).
    const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert({ title: topic.trim(), category: category ?? null, source: "user" })
        .select()
        .single();

    if (topicError) {
        return NextResponse.json({ error: topicError.message }, { status: 500 });
    }

    const { data: challenge, error: challengeError } = await supabase
        .from("challenges")
        .insert({ creator_id: user.id, topic_id: topicData.id, status: "open" })
        .select()
        .single();

    if (challengeError) {
        return NextResponse.json({ error: challengeError.message }, { status: 500 });
    }

    return NextResponse.json({ challenge, topic: topicData });
}
