// Thin, FAIL-OPEN wrappers around the durable usage counters (migration 0015).
//
// Critical runnability guarantee: if 0015 has NOT been applied yet (the
// record_usage / usage_today functions or the is_pro column are missing), every
// helper here degrades gracefully — reads return 0, writes are no-ops, and
// fetchIsPro returns false. Callers therefore never break, and the existing
// hard-coded caps remain the effective limit until the migration lands.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeteredAction } from "./limits";

// Increment today's counter for (user, action). Returns the new count, or null
// if the metering backend isn't available yet (fail-open).
export async function recordUsage(
    client: SupabaseClient,
    userId: string,
    action: MeteredAction
): Promise<number | null> {
    try {
        const { data, error } = await client.rpc("record_usage", {
            p_user_id: userId,
            p_action: action,
        });
        if (error) return null;
        return typeof data === "number" ? data : null;
    } catch {
        return null;
    }
}

// Read today's counter without incrementing. Returns 0 on any error.
export async function usageToday(
    client: SupabaseClient,
    userId: string,
    action: MeteredAction
): Promise<number> {
    try {
        const { data, error } = await client.rpc("usage_today", {
            p_user_id: userId,
            p_action: action,
        });
        if (error) return 0;
        return typeof data === "number" ? data : 0;
    } catch {
        return 0;
    }
}

// Read a user's is_pro flag. Returns false if the column/row is unavailable.
export async function fetchIsPro(
    client: SupabaseClient,
    userId: string
): Promise<boolean> {
    try {
        const { data, error } = await client
            .from("users")
            .select("is_pro")
            .eq("id", userId)
            .single();
        if (error || !data) return false;
        return (data as { is_pro?: boolean }).is_pro === true;
    } catch {
        return false;
    }
}
