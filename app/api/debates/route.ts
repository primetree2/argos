import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ORACLE_USER_ID } from "@/lib/ai/oracle";
import { getEntitlements, isActionAllowed } from "@/lib/billing/limits";
import { fetchIsPro, recordUsage, usageToday } from "@/lib/billing/usage";
import { getOrCreateTopic } from "@/lib/topics";
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
// vs-Oracle debates cost 2 Gemini calls each (argue + judge), so they get a
// tighter daily cap to protect the free Gemini quota (ROADMAP Phase 1, item 2).
const MAX_ORACLE_DEBATES_PER_DAY = 3;
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

    const { topic, mode, totalRounds, opponentType, blitz, lightning } = await request.json();
    // Lightning on-ramp (ROADMAP 2.4 item 1): a single-round, blitz-paced,
    // casual debate vs the Oracle with zero wait. It is just a constrained
    // shape of the existing vs-Oracle create path — we force the fields here so
    // the rest of the route (Oracle cap, ACTIVE start, oracle-turn trigger) is
    // reused verbatim. No new tables/columns.
    const isLightning = lightning === true;
    const isOracle = isLightning || opponentType === "ai";
    const isBlitz = isLightning || blitz === true;

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
    // vs-Oracle debates are always casual (no Elo) — the ranked ladder stays
    // human-only. Human-vs-human debates honour the requested mode.
    const resolvedMode = isOracle
        ? "casual"
        : ALLOWED_MODES.includes(mode) ? mode : "casual";
    // Lightning is always exactly 1 round. Otherwise honour the requested
    // rounds from the allowed set (1 is intentionally NOT in ALLOWED_ROUNDS, so
    // a single-round debate can ONLY be created via the lightning flag).
    const resolvedRounds = isLightning
        ? 1
        : ALLOWED_ROUNDS.includes(totalRounds) ? totalRounds : 3;

    // ── Entitlement check (Phase 5 plumbing) ──
    // INERT during beta: getEntitlements().enforced is false while
    // BETA_UNLIMITED, so isActionAllowed() always returns true and nothing is
    // blocked here. When the paywall is later switched on, free vs Pro daily
    // limits apply with no further code change. Fully fail-open: if migration
    // 0015 isn't applied, fetchIsPro/usageToday degrade to false/0.
    const isPro = await fetchIsPro(serviceClient, user.id);
    const ent = getEntitlements(isPro);
    const meteredAction = isOracle ? "oracle_debate" : "debate_create";
    if (ent.enforced) {
        const used = await usageToday(serviceClient, user.id, meteredAction);
        if (!isActionAllowed(ent, meteredAction, used)) {
            return NextResponse.json(
                {
                    error: isOracle
                        ? `Daily Oracle limit reached (${ent.limits.oracle_debate}/day).`
                        : `Daily debate limit reached (${ent.limits.debate_create}/day). Try again later.`,
                },
                { status: 429 }
            );
        }
    }

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

    // vs-Oracle has its own tighter cap (protects the Gemini free tier). Counted
    // server-side via the oracle_debates_today() SQL function from 0006.
    if (isOracle) {
        const { data: oracleCount, error: capError } = await serviceClient.rpc(
            "oracle_debates_today",
            { p_user_id: user.id }
        );
        if (!capError && (oracleCount ?? 0) >= MAX_ORACLE_DEBATES_PER_DAY) {
            return NextResponse.json(
                {
                    error: `Daily Oracle limit reached (${MAX_ORACLE_DEBATES_PER_DAY}/day). Challenge a human opponent instead.`,
                },
                { status: 429 }
            );
        }
    }

    // Resolve the topic, reusing an existing row for this title (the unique
    // constraint from 0004 means a blind insert would throw on a repeat title,
    // which Lightning hits constantly by seeding the Daily Topic).
    const { data: topicData, error: topicError } = await getOrCreateTopic(
        supabase,
        trimmedTopic,
        { source: "user" }
    );

    if (topicError || !topicData) {
        return NextResponse.json(
            { error: topicError ?? "Could not create topic." },
            { status: 500 }
        );
    }

    // Create debate. A vs-Oracle debate has no "waiting for opponent" phase:
    // the Oracle is player_b immediately and the debate starts ACTIVE on the
    // human's (player_a) turn. A human debate stays 'waiting' until joined.
    const { data: debate, error: debateError } = await supabase
        .from("debates")
        .insert({
            topic_id: topicData.id,
            player_a_id: user.id,
            player_b_id: isOracle ? ORACLE_USER_ID : null,
            player_a_side: "FOR",
            mode: resolvedMode,
            status: isOracle ? "active" : "waiting",
            current_turn: user.id,
            total_rounds: resolvedRounds,
            is_public: true,
            blitz: isBlitz,
            turn_started_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (debateError) {
        // Don't leave an orphaned topic behind if the debate insert fails — but
        // ONLY delete it if we created it just now. Topics are shared across
        // debates (deduped by title), so deleting a reused row would orphan
        // other debates.
        if (topicData.created) {
            await serviceClient.from("topics").delete().eq("id", topicData.id);
        }
        return NextResponse.json({ error: debateError.message }, { status: 500 });
    }

    // Record usage AFTER a successful create (fail-open; never blocks the
    // response). Powers the future paywall + analytics; no-op pre-0015.
    await recordUsage(serviceClient, user.id, meteredAction);

    return NextResponse.json({ debate, topic: { id: topicData.id, title: trimmedTopic } });
}
