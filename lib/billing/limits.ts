// Phase 5 monetization plumbing — the SINGLE source of truth for free-tier
// limits and Pro entitlements (ROADMAP Phase 5 FREE items 1-2).
//
// The whole point: build the paywall plumbing now so flipping it on later is a
// one-line change, while charging NO ONE during beta.
//
//   - BETA_UNLIMITED = true  → everyone is effectively unlimited; the limits
//     below are advisory only and nothing is ever blocked. This is the current
//     beta behaviour.
//   - BETA_UNLIMITED = false → free users are held to FREE_LIMITS; users with
//     is_pro = true get PRO_LIMITS. No other code changes needed to go live.
//
// Metered actions are durable per-user/per-UTC-day counters backed by the
// daily_usage table + record_usage()/usage_today() (migration 0015).

export const BETA_UNLIMITED = true;

// The metered actions tracked in daily_usage.action. Keep these string values
// stable — they are the persisted keys.
export type MeteredAction = "debate_create" | "oracle_debate" | "ranked_match";

export interface Limits {
    /** Max human-or-AI debates a user may CREATE per UTC day. */
    debate_create: number;
    /** Max vs-Oracle debates per UTC day (protects the Gemini free tier). */
    oracle_debate: number;
    /** Max ranked matchmaking entries per UTC day. */
    ranked_match: number;
}

// Free tier — mirrors the historical hard-coded caps so turning the paywall on
// later does not silently tighten today's behaviour.
export const FREE_LIMITS: Limits = {
    debate_create: 20,
    oracle_debate: 3,
    ranked_match: 50,
};

// Pro tier — generous but still bounded so a single account can't exhaust the
// shared Gemini free quota. Tune when real billing exists.
export const PRO_LIMITS: Limits = {
    debate_create: 200,
    oracle_debate: 30,
    ranked_match: 500,
};

export interface Entitlements {
    isPro: boolean;
    /** When false, NOTHING is blocked regardless of limits (beta). */
    enforced: boolean;
    limits: Limits;
}

// Resolve a user's entitlements from their is_pro flag. During beta
// (BETA_UNLIMITED) enforcement is off, so callers should treat every action as
// allowed — but they can still record usage for analytics.
export function getEntitlements(isPro: boolean | null | undefined): Entitlements {
    const pro = isPro === true;
    return {
        isPro: pro,
        enforced: !BETA_UNLIMITED,
        limits: pro ? PRO_LIMITS : FREE_LIMITS,
    };
}

// True when an action is permitted given the user's entitlements and the count
// they have ALREADY used today. Always true while beta-unlimited.
export function isActionAllowed(
    ent: Entitlements,
    action: MeteredAction,
    usedToday: number
): boolean {
    if (!ent.enforced) return true;
    return usedToday < ent.limits[action];
}
