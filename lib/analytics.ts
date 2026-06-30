"use client";

import posthog from "posthog-js";

// Typed PostHog funnel instrumentation (ROADMAP §6.2 item 7 / Pillar 1/4).
//
// One place that defines the funnel events so the curve
//   signup → first argument → second debate → D1/D7
// is consistent and analyzable in PostHog (no stringly-typed event names
// scattered across the app). Every call is a SAFE no-op if PostHog isn't
// initialized (key unset, SSR, or init failed) and never throws into a UI
// path — instrumentation must never break a user action.

export type FunnelEvent =
    // Top of funnel — the pre-auth taste (§5.2 force 4).
    | "anon_roast_started"
    | "anon_roast_verdict"
    // Authed solo hook.
    | "roast_completed"
    // Activation: a signed-in session reached the dashboard.
    | "signed_in"
    // The core activation step — the user submitted an argument in a debate.
    | "argument_submitted"
    // A debate the user took part in reached completion (the verdict).
    | "debate_completed"
    // Retention/identity surface viewed.
    | "recap_viewed";

function ready(): boolean {
    // posthog-js is a singleton; __loaded is set once init() resolves. Guard so
    // a capture before init (or with no key) is a silent no-op.
    try {
        return typeof window !== "undefined" && !!(posthog as unknown as { __loaded?: boolean }).__loaded;
    } catch {
        return false;
    }
}

export function track(
    event: FunnelEvent,
    properties?: Record<string, string | number | boolean | null>
): void {
    try {
        if (!ready()) return;
        posthog.capture(event, properties);
    } catch {
        /* analytics must never break a user action */
    }
}

// Associate subsequent events with a stable user id (called once the user is
// known, e.g. on the dashboard) so the funnel can be measured per-person and
// D1/D7 retention is computable. Safe no-op if PostHog isn't ready.
export function identifyUser(
    userId: string,
    properties?: Record<string, string | number | boolean | null>
): void {
    try {
        if (!ready() || !userId) return;
        posthog.identify(userId, properties);
    } catch {
        /* never throw from analytics */
    }
}
