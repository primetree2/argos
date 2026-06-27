"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Live viewer count via Supabase Realtime presence (ROADMAP Phase 3, item 1).
//
// Everyone viewing a debate joins a per-debate presence channel and is counted.
// The count updates live as people open/close the page. This is the
// spectator-experience signal that makes a debate feel "live". Stays within the
// free Realtime tier (presence is lightweight).
//
// `viewerKey` should be a stable-per-session id (the user id, or a random id
// for anonymous viewers) so one person isn't counted multiple times across
// quick remounts.
export function SpectatorPresence({
    debateId,
    viewerKey,
}: {
    debateId: string;
    viewerKey: string;
}) {
    const [count, setCount] = useState(1);

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase.channel(`presence:debate:${debateId}`, {
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
    }, [debateId, viewerKey]);

    return (
        <span
            title="People watching this debate right now"
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
                padding: "0.25rem 0.55rem",
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
            {count} watching
        </span>
    );
}
