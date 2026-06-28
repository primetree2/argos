import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { scoreArgument } from "@/lib/ai/judge";
import { moderateWithOracle } from "@/lib/ai/judge";
import { checkRateLimit } from "@/lib/rateLimit";
import { getArchetype } from "@/lib/ai/archetype";

// A take can legitimately be a single short line (a tweet), so we do NOT apply
// lib/moderation's 10-word debate-argument floor here. We keep a focused
// profanity gate inline; the Gemini safety pass below is the real safety check.
const PROFANITY = /\b(fuck|shit|bitch|asshole|cunt|nigger|faggot)\b/i;

// Solo "roast my take" (ROADMAP §2.5 — the lowest-friction hook).
//
// Paste any take; the Oracle scores it with the SAME neutral judge used for
// real debates and names its fallacies, instantly. This route writes NOTHING
// to the database — no debate, no argument, no topic row — so it cannot affect
// Elo, the feed, or any existing flow, and needs no migration. It is a pure
// read-through to Gemini + a pure archetype function.

const MIN_LEN = 12;
const MAX_LEN = 1200;

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { take?: unknown; stance?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const take = typeof body.take === "string" ? body.take.trim() : "";
    // Optional self-declared stance shown to the judge as the "topic". When
    // omitted, the take itself is treated as a standalone claim being defended.
    const stance = typeof body.stance === "string" ? body.stance.trim().slice(0, 300) : "";

    if (take.length < MIN_LEN) {
        return NextResponse.json(
            { error: `Write a bit more (min ${MIN_LEN} characters).` },
            { status: 400 }
        );
    }
    if (take.length > MAX_LEN) {
        return NextResponse.json(
            { error: `That's a lot — keep it under ${MAX_LEN} characters.` },
            { status: 400 }
        );
    }

    // Cheap always-on profanity gate (length is already bounded above).
    if (PROFANITY.test(take)) {
        return NextResponse.json(
            { error: "Keep it respectful — lose the slurs and try again." },
            { status: 400 }
        );
    }

    // Fail-open rate limit: 10 roasts / 60s / user. Protects the Gemini free
    // tier without locking anyone out on a throttle fault (0008 may be absent).
    const allowed = await checkRateLimit(supabase, `roast:${user.id}`, 10, 60);
    if (!allowed) {
        return NextResponse.json(
            { error: "You're roasting fast. Give the Oracle a moment and try again." },
            { status: 429 }
        );
    }

    // Same Gemini safety pass used on real arguments (fail-open inside).
    const safety = await moderateWithOracle(take);
    if (!safety.allowed) {
        return NextResponse.json({ error: safety.reason }, { status: 400 });
    }

    // The judge scores argumentation quality only, never whether the take is
    // "correct". The take is both the claim and the argument here, so there is
    // no opponent/previous argument. The stance (if given) frames the topic.
    const topic = stance || take;
    try {
        const score = await scoreArgument(topic, "FOR", take, null);
        const archetype = getArchetype(score);
        return NextResponse.json({ score, archetype });
    } catch {
        return NextResponse.json(
            { error: "The Oracle could not reach a verdict. Try again in a moment." },
            { status: 503 }
        );
    }
}
