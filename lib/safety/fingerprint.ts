import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Anti-Sybil fingerprinting (ROADMAP Phase 1, item 5). SOFT SIGNAL ONLY: we
// store a one-way hash of the client IP on the user row and flag debates where
// both players share that hash. Nothing is ever auto-banned — this only sets
// debates.suspected_sybil = true for a future review queue (migration 0008).
//
// We hash (never store the raw IP) with a server-side salt so the value can't
// be reversed to an address. If CRON_SECRET is unset we fall back to a fixed
// salt; the hash is still non-reversible for practical purposes.

function salt(): string {
    return process.env.CRON_SECRET ?? "argos-fingerprint-salt";
}

// Best-effort client IP from the standard proxy headers Vercel sets.
export function clientIpFrom(request: Request): string | null {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || null;
    return request.headers.get("x-real-ip");
}

export function hashSignupIp(ip: string): string {
    return createHash("sha256").update(`${salt()}:${ip}`).digest("hex");
}

// Set users.signup_ip_hash for `userId` ONLY if it is currently null, so a
// user's first-seen network is recorded once and not overwritten thereafter.
// Best-effort: never throws into the caller's hot path.
export async function backfillIpHash(
    client: SupabaseClient,
    userId: string,
    request: Request
): Promise<void> {
    try {
        const ip = clientIpFrom(request);
        if (!ip) return;
        await client
            .from("users")
            .update({ signup_ip_hash: hashSignupIp(ip) })
            .eq("id", userId)
            .is("signup_ip_hash", null);
    } catch (e) {
        console.error("backfillIpHash error:", e);
    }
}

// Ask the DB to flag a debate as suspected Sybil if both players share a hash.
// No-op unless both hashes are non-null and equal. Best-effort.
export async function flagSybilDebate(
    client: SupabaseClient,
    debateId: string
): Promise<void> {
    try {
        await client.rpc("flag_sybil_debate", { p_debate_id: debateId });
    } catch (e) {
        console.error("flag_sybil_debate error:", e);
    }
}
