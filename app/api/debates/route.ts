import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service-role client: used only to count a user's recent debates for rate
// limiting (authoritative, not subject to RLS visibility) and to clean up an
// orphaned topic if the debate insert fails.
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Free-tier abuse guard: cap how many debates one user can create per rolling
// 24h window. DB-backed (no Redis needed) — cheap with idx_debates_player_a.
const MAX_DEBATES_PER_DAY = 20;
const MAX_TOPIC_LEN = 300;
const MIN_TOPIC_LEN = 8;
const ALLOWED_ROUNDS = [2, 3, 4, 5];
const ALLOWED_MODES = ["casual", "ranked"];

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topic, mode, totalRounds } = await request.json();

    // ── Input validation ──
    if (typeof topic !== "string") {
        return NextResponse.json({ error: "Missing topic." }, { status: 400 });
    }
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length < MIN_TOPIC_LEN) {
        return NextResponse.json(
            { error: `Topic is too short (min ${MIN_TOPIC_LEN} characters).` },
            { status: 400 }
        );
    }
    if (trimmedTopic.length > MAX_TOPIC_LEN) {
        return NextResponse.json(
            { error: `Topic is too long (max ${MAX_TOPIC_LEN} characters).` },
            { status: 400 }
        );
    }
    const resolvedMode = ALLOWED_MODES.includes(mode) ? mode : "casual";
    const resolvedRounds = ALLOWED_ROUNDS.includes(totalRounds) ? totalRounds : 3;

    // ── Rate limit: max N debates per rolling 24h ──
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await serviceClient
        .from("debates")
        .select("id", { count: "exact", head: true })
        .eq("player_a_id", user.id)
        .gte("created_at", since);

    if ((count ?? 0) >= MAX_DEBATES_PER_DAY) {
        return NextResponse.json(
            {
                error: `Daily debate limit reached (${MAX_DEBATES_PER_DAY}/day). Try again later.`,
            },
            { status: 429 }
        );
    }

    // Create topic first.
    const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert({ title: trimmedTopic, source: "user" })
        .select()
        .single();

    if (topicError) {
        return NextResponse.json({ error: topicError.message }, { status: 500 });
    }

    // Create debate.
    const { data: debate, error: debateError } = await supabase
        .from("debates")
        .insert({
            topic_id: topicData.id,
            player_a_id: user.id,
            player_a_side: "FOR",
            mode: resolvedMode,
            status: "waiting",
            current_turn: user.id,
            total_rounds: resolvedRounds,
            is_public: true,
            turn_started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (debateError) {
        // Don't leave an orphaned topic behind if the debate insert fails.
        await serviceClient.from("topics").delete().eq("id", topicData.id);
        return NextResponse.json({ error: debateError.message }, { status: 500 });
    }

    return NextResponse.json({ debate, topic: topicData });
}
