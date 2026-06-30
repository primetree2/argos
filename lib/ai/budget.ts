import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";

// Gemini global + per-user daily budget breaker (ROADMAP Pillar 1 / R5 + R11).
//
// Every argument is one Gemini call; every Oracle/Lightning debate is two; the
// solo roast is one. There was no global ceiling, and the internal /api/score
// path is EXEMPT from the normal per-user rate limit (it bears CRON_SECRET), so
// a leaked secret = an unmetered Gemini cost-bomb (R11). This module adds a
// cheap, free ceiling INDEPENDENT of that exemption.
//
// Implementation: we reuse the already-deployed check_rate_limit(key, limit,
// window_seconds) SQL function (migration 0008) as a fixed-window daily
// counter. The key is bucketed by UTC day so the window naturally rolls over at
// 00:00 UTC; the 24h window arg is a backstop if a key is first seen mid-day.
// No new table, NO migration.
//
// FAIL-OPEN: any DB/RPC error allows the call (checkRateLimit already fails
// open). A metering fault must never block legitimate scoring/play. The trade
// is intentional — the breaker exists to stop a runaway/abuse cost spiral, not
// to be a hard quota that can lock the product if the counter itself breaks.
//
// Env overrides (all optional; sane free-tier defaults below):
//   GEMINI_DAILY_GLOBAL_LIMIT    — max Gemini calls/day across ALL users
//   GEMINI_DAILY_PER_USER_LIMIT  — max Gemini calls/day for one user id

const DAY_SECONDS = 24 * 60 * 60;

function intFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Free-tier defaults. Generous enough never to touch real usage at current
// traffic, low enough to cap a runaway loop or a leaked-secret abuse spike.
export function globalDailyLimit(): number {
    return intFromEnv("GEMINI_DAILY_GLOBAL_LIMIT", 5000);
}
export function perUserDailyLimit(): number {
    return intFromEnv("GEMINI_DAILY_PER_USER_LIMIT", 300);
}

// UTC day stamp, e.g. "2026-06-30". Bucketing the rate-limit key by day means
// the counter resets at 00:00 UTC regardless of when the first call landed.
function utcDay(): string {
    return new Date().toISOString().slice(0, 10);
}

export interface BudgetResult {
    allowed: boolean;
    scope?: "global" | "user";
}

// Consume one unit of Gemini budget. Checks the GLOBAL daily ceiling first,
// then the per-user ceiling. Both increment a counter, so a denied call still
// counts toward the window (which is correct — we want to clamp a spiral, and
// the increment is what trips the breaker). Pass a userId when one is known
// (scoring, roast); omit it for anonymous/system calls (global cap still
// applies).
export async function consumeGeminiBudget(
    client: SupabaseClient,
    userId?: string | null
): Promise<BudgetResult> {
    const day = utcDay();

    const globalOk = await checkRateLimit(
        client,
        `gemini:global:${day}`,
        globalDailyLimit(),
        DAY_SECONDS
    );
    if (!globalOk) return { allowed: false, scope: "global" };

    if (userId) {
        const userOk = await checkRateLimit(
            client,
            `gemini:user:${userId}:${day}`,
            perUserDailyLimit(),
            DAY_SECONDS
        );
        if (!userOk) return { allowed: false, scope: "user" };
    }

    return { allowed: true };
}
