import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topic, mode, totalRounds } = await request.json();

    // Create topic first
    const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert({ title: topic, source: "user" })
        .select()
        .single();

    if (topicError) {
        return NextResponse.json({ error: topicError.message }, { status: 500 });
    }

    // Create debate
    const { data: debate, error: debateError } = await supabase
        .from("debates")
        .insert({
            topic_id: topicData.id,
            player_a_id: user.id,
            player_a_side: "FOR",
            mode: mode ?? "casual",
            status: "waiting",
            current_turn: user.id,
            total_rounds: totalRounds ?? 3,
            is_public: true,
            turn_started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (debateError) {
        return NextResponse.json({ error: debateError.message }, { status: 500 });
    }

    return NextResponse.json({ debate, topic: topicData });
}