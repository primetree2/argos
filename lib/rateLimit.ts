import type { SupabaseClient } from "@supabase/supabase-js";

// DB-backed rolling-window rate limiting (ROADMAP Phase 1, item 6).
//
// Thin wrapper over the check_rate_limit(p_key, p_limit, p_window_seconds) SQL
// function from migration 0008. That function atomically increments a per-key
// fixed-window counter and returns whether the caller is within the limit, so
// the guard works across all serverless instances without Redis.
//
// FAIL-OPEN: on any RPC error we ALLOW the request. A throttle that itself
// errors must never lock users out of core actions (matchmaking, scoring).
//
// Key convention: "<scope>:<identifier>", e.g. "mm:<userId>", "score:<userId>".
export async function checkRateLimit(
    client: SupabaseClient,
    key: string,
    limit: number,
    windowSeconds: number
): Promise<boolean> {
    const { data, error } = await client.rpc("check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
    });
    if (error) {
        console.error("check_rate_limit rpc error:", error.message);
        return true; // fail open
    }
    return data !== false;
}
