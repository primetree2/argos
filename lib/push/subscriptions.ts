import type { SupabaseClient } from "@supabase/supabase-js";

// Push subscription store helpers (ROADMAP 2.4 item 3).
//
// FAIL-OPEN: every helper swallows errors (a missing 0019 table, transient DB
// faults) and returns false — registering/removing a push subscription is a
// nicety and must never throw into the calling route. Writes are expected to
// use the service-role client so they bypass RLS (end users only read/delete
// their own rows via the policies in 0019).

export interface BrowserSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

function isValid(sub: unknown): sub is BrowserSubscription {
    if (typeof sub !== "object" || sub === null) return false;
    const s = sub as Record<string, unknown>;
    const keys = s.keys as Record<string, unknown> | undefined;
    return (
        typeof s.endpoint === "string" &&
        typeof keys?.p256dh === "string" &&
        typeof keys?.auth === "string"
    );
}

/**
 * Upsert a browser PushSubscription for a user (keyed by endpoint, so the same
 * device re-subscribing is idempotent). Returns true on success.
 */
export async function saveSubscription(
    client: SupabaseClient,
    userId: string,
    sub: unknown,
    userAgent?: string | null
): Promise<boolean> {
    if (!userId || !isValid(sub)) return false;
    try {
        const { error } = await client
            .from("push_subscriptions")
            .upsert(
                {
                    user_id: userId,
                    endpoint: sub.endpoint,
                    p256dh: sub.keys.p256dh,
                    auth: sub.keys.auth,
                    user_agent: userAgent ?? null,
                },
                { onConflict: "endpoint" }
            );
        return !error;
    } catch {
        return false;
    }
}

/**
 * Remove a subscription by endpoint (on unsubscribe). When no endpoint is
 * given, removes ALL of the user's subscriptions. Returns true on success.
 */
export async function deleteSubscription(
    client: SupabaseClient,
    userId: string,
    endpoint?: string | null
): Promise<boolean> {
    if (!userId) return false;
    try {
        let q = client.from("push_subscriptions").delete().eq("user_id", userId);
        if (endpoint) q = q.eq("endpoint", endpoint);
        const { error } = await q;
        return !error;
    } catch {
        return false;
    }
}
