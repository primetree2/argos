import { createClient as createServiceClient } from "@supabase/supabase-js";

// Server-side matchmaking core (#6). Delegates the actual match + claim to the
// `match_player` Postgres function, which performs candidate selection,
// debate creation, and claiming of BOTH queue rows in a single transaction
// using FOR UPDATE SKIP LOCKED. This makes matchmaking fully race-safe:
// concurrent callers can never grab the same opponent or create duplicate
// debates (Bug 8). The Elo-band-by-wait-time rule lives inside the SQL
// function; see the migration for details.

export interface MatchResult {
    matched: boolean;
    debateId?: string;
}

export interface MatchOptions {
    // Quick Match: pair straight into a fast Blitz debate (90s turns). Requires
    // match_player_v2 (migration 0014); falls back to a standard debate if that
    // function is not present yet.
    blitz?: boolean;
}

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// Postgres error code for "function does not exist" (migration 0014 not applied
// yet). We detect it to fall back to the original match_player.
const UNDEFINED_FUNCTION = "42883";

/**
 * Attempt to match the given user against another waiting player.
 * Race-safe and idempotent: all selection/creation/claiming happens atomically
 * in the SQL function.
 *
 * For a blitz request we call `match_player_v2` (which stamps debates.blitz).
 * If that function isn't present yet (migration 0014 not applied), we fall back
 * to the original `match_player`, so the app stays runnable before the SQL is
 * run — Quick Match just produces a standard debate until then.
 */
export async function attemptMatch(
    userId: string,
    opts: MatchOptions = {}
): Promise<MatchResult> {
    const client = serviceClient();

    if (opts.blitz) {
        const { data, error } = await client.rpc("match_player_v2", {
            p_user_id: userId,
            p_blitz: true,
        });
        if (!error) {
            const debateId = typeof data === "string" ? data : null;
            return debateId ? { matched: true, debateId } : { matched: false };
        }
        // Only fall back when the function is genuinely missing; surface other
        // errors as "no match this attempt" (the poll will retry).
        if (error.code !== UNDEFINED_FUNCTION) {
            console.error("match_player_v2 rpc error:", error.message);
            return { matched: false };
        }
        // else: fall through to the legacy match_player below.
    }

    const { data, error } = await client.rpc("match_player", { p_user_id: userId });

    if (error) {
        console.error("match_player rpc error:", error.message);
        return { matched: false };
    }

    // The function returns the debate uuid when matched (or already matched),
    // and null when no opponent is available yet.
    const debateId = typeof data === "string" ? data : null;
    if (!debateId) return { matched: false };
    return { matched: true, debateId };
}
