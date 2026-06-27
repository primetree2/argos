"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Live "N online" count via a single global Supabase Realtime presence channel
// (ROADMAP Phase 4 — the lobby signal for presence-based Quick Match). Every
// logged-in viewer joins `presence:lobby` keyed by their user id, so a person
// open in two tabs counts once. Ephemeral presence only — no DB writes — and
// stays within the free Realtime tier.
export function OnlinePresence({ viewerKey }: { viewerKey: string }) {
    const [count, setCount] = useState(1);

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase.channel("presence:lobby", {
            config: { presence: { key: viewerKey } },
        });

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState();
                setCount(Math.max(1, Object.keys(state).length));
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await channel.track({ at: Date.now() });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [viewerKey]);

    return (
        <span
            title="Debaters online right now"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontFamily: "var(--font-share-tech), monospace",
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                color: "var(--text-teal)",
                border: "1px solid var(--teal-border)",
                background: "var(--teal-glow)",
                borderRadius: "var(--radius-sm)",
                padding: "0.25rem 0.6rem",
                whiteSpace: "nowrap",
            }}
        >
            <span
                style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--teal)",
                    boxShadow: "0 0 8px var(--teal)",
                    animation: "oracle-pulse 1.8s ease-in-out infinite",
                    display: "inline-block",
                }}
            />
            {count} online
        </span>
    );
}
