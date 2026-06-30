"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Identity-based X share for the weekly recap (ROADMAP §5.2 force 2 — the
// recap is the best ORGANIC share artifact because it's about THEM). Client
// island only so it can read window.location.origin for the share URL. It
// always renders when a recap exists, so it doubles as the recap_viewed
// funnel marker (§6.2 item 7).
export function ShareRecapButton({
    archetype,
    avgScore,
    strongest,
}: {
    archetype: string;
    avgScore: number;
    strongest: string;
}) {
    useEffect(() => {
        track("recap_viewed", { archetype, avg_score: avgScore });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const text = `This week the Oracle read my mind as "${archetype}" — strongest in ${strongest}, averaging ${avgScore}/80. What does yours read as?`;
    const url =
        typeof window !== "undefined"
            ? `${window.location.origin}/`
            : "https://argos-indol.vercel.app/";
    const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-oracle"
            style={{ fontSize: "0.72rem", letterSpacing: "0.16em", padding: "0.8rem 1.6rem", textDecoration: "none" }}
        >
            Share your week →
        </a>
    );
}
