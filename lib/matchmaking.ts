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

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/**
 * Attempt to match the given user against another waiting player.
 * Race-safe and idempotent: all selection/creation/claiming happens atomically
 * in the `match_player` SQL function.
 */
export async function attemptMatch(userId: string): Promise<MatchResult> {
    const client = serviceClient();

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
