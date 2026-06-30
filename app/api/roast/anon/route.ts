import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { scoreArgument } from "@/lib/ai/judge";
import { getArchetype } from "@/lib/ai/archetype";
import { moderateArgumentSafety } from "@/lib/moderation";
import { consumeGeminiBudget } from "@/lib/ai/budget";
import { checkRateLimit } from "@/lib/rateLimit";
import { clientIpFrom, hashSignupIp } from "@/lib/safety/fingerprint";

// POST /api/roast/anon  { take, stance? }  (NO AUTH)
//
// The anonymous, pre-auth landing roast (ROADMAP §6.2 item 5 / §5.2 force 4 —
// let the first taste happen BEFORE the auth wall, the single highest-leverage
// growth lever). A logged-out visitor pastes a take and gets the Oracle's
// verdict instantly. Identical scoring to the authed /api/roast, but:
//   - it WRITES NOTHING to the DB (no user, no debate, no Elo) — same as roast;
//   - it is hardened for an UNAUTHENTICATED surface (see below).
//
// Hardening for the open endpoint:
//   1. Strict per-IP rate limit (hashed IP, never raw) — 3/hour — so the open
//      route can't be turned into a free Gemini proxy. Fail-open (0008 absent
//      → allow), so it never hard-breaks, but the budget breaker still caps it.
//   2. The Gemini budget breaker (R5/R11), keyed to the IP hash, so anonymous
//      spend counts against the same global ceiling as everything else.
//   3. Fail-CLOSED safety moderation: anonymous callers are UNTRUSTED, so a
//      safety-pass error rejects rather than allows (R2).

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROFANITY = /\b(fuck|shit|bitch|asshole|cunt|nigger|faggot)\b/i;
const MIN_LEN = 12;
const MAX_LEN = 1200;

// Stricter than the authed roast (10/60s/user): an anonymous visitor gets a
// real taste but can't loop the open endpoint. Per hashed IP.
const ANON_LIMIT = 3;
const ANON_WINDOW_SECONDS = 60 * 60;

export async function POST(request: Request) {
    let body: { take?: unknown; stance?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const take = typeof body.take === "string" ? body.take.trim() : "";
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
    if (PROFANITY.test(take)) {
        return NextResponse.json(
            { error: "Keep it respectful — lose the slurs and try again." },
            { status: 400 }
        );
    }

    // Per-IP identity for rate limiting + budget (hashed, never the raw IP).
    // No IP header (local dev) falls back to a shared key, which the budget
    // breaker still bounds globally.
    const ip = clientIpFrom(request);
    const ipKey = ip ? hashSignupIp(ip) : "anon";

    const underLimit = await checkRateLimit(
        serviceClient,
        `roast-anon:${ipKey}`,
        ANON_LIMIT,
        ANON_WINDOW_SECONDS
    );
    if (!underLimit) {
        return NextResponse.json(
            {
                error: "You've used your free roasts. Sign in to keep going — it's free.",
                limited: true,
            },
            { status: 429 }
        );
    }

    // Gemini budget breaker (R5/R11): anonymous spend counts against the same
    // global ceiling, keyed per IP hash so one visitor can't exhaust it alone.
    const budget = await consumeGeminiBudget(serviceClient, `anon:${ipKey}`);
    if (!budget.allowed) {
        return NextResponse.json(
            { error: "The Oracle is at capacity right now. Try again later." },
            { status: 503 }
        );
    }

    // Fail-CLOSED safety (anonymous = untrusted): a safety-pass error rejects.
    const safety = await moderateArgumentSafety(take, { trusted: false });
    if (!safety.allowed) {
        return NextResponse.json({ error: safety.reason }, { status: 400 });
    }

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
