import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort player geolocation for Quick Match country flags.
//
// Vercel's edge sets `x-vercel-ip-country` to the ISO 3166-1 alpha-2 code of
// the request's origin (e.g. "US", "PK"). We record it on the user row the
// first time we see it during matchmaking, exactly like the anti-Sybil IP hash
// backfill: first-sight only (never overwritten), and never thrown into the
// caller's hot path. Privacy-wise this is coarse country only — no city, no IP
// stored here.
//
// FAIL-OPEN: if the header is absent (local dev, non-Vercel host) or the column
// doesn't exist yet (migration 0017 not applied), this silently no-ops and
// matchmaking proceeds normally — the player simply has no flag.

const CODE_RE = /^[A-Z]{2}$/;

export function countryFrom(request: Request): string | null {
    // Primary: Vercel edge geo header. Fallbacks cover other common proxies.
    const raw =
        request.headers.get("x-vercel-ip-country") ??
        request.headers.get("cf-ipcountry") ?? // Cloudflare
        request.headers.get("x-country-code");
    if (!raw) return null;
    const cc = raw.trim().toUpperCase();
    // "XX"/"T1" are Vercel's placeholders for unknown/Tor; treat as no country.
    if (!CODE_RE.test(cc) || cc === "XX" || cc === "T1") return null;
    return cc;
}

// Set users.country for `userId` ONLY if it is currently null, so a player's
// first-seen country is recorded once and not churned on every request.
// Best-effort + fail-open (a missing column / header never breaks matchmaking).
export async function backfillCountry(
    client: SupabaseClient,
    userId: string,
    request: Request
): Promise<void> {
    try {
        const cc = countryFrom(request);
        if (!cc) return;
        await client
            .from("users")
            .update({ country: cc })
            .eq("id", userId)
            .is("country", null);
    } catch (e) {
        console.error("backfillCountry error:", e);
    }
}
