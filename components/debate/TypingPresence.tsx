"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Chat-app style "opponent is typing…" signal over a Supabase Realtime
// broadcast channel. Broadcast (not presence/postgres) is the right primitive:
// the typing state is ephemeral and must never touch the database.
//
// Contract:
//   - The hook returns `notifyTyping()`, which the composing player calls on
//     every keystroke. It is throttled internally to one event per second and
//     automatically emits a "stopped" event after a short idle gap.
//   - `opponentTyping` is true while the OTHER participant is actively typing.
//
// Spectators may listen but their own typing is irrelevant; callers simply
// don't wire notifyTyping() for them.

const THROTTLE_MS = 1000; // max one "typing" broadcast per second
const IDLE_MS = 3000; // consider the opponent stopped after this gap

export function useTypingPresence({
    debateId,
    userId,
}: {
    debateId: string;
    userId: string;
}): { opponentTyping: boolean; notifyTyping: () => void } {
    const [opponentTyping, setOpponentTyping] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const lastSentRef = useRef(0);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase.channel(`typing:debate:${debateId}`, {
            config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        channel
            .on("broadcast", { event: "typing" }, ({ payload }) => {
                // Only react to the OTHER participant's typing events.
                if (!payload || payload.userId === userId) return;
                setOpponentTyping(Boolean(payload.typing));
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                if (payload.typing) {
                    // Auto-clear if the "stopped" event is dropped (mobile drops
                    // websockets silently), so the indicator never sticks.
                    idleTimerRef.current = setTimeout(
                        () => setOpponentTyping(false),
                        IDLE_MS
                    );
                }
            })
            .subscribe();

        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            channelRef.current = null;
            supabase.removeChannel(channel);
        };
    }, [debateId, userId]);

    const send = useCallback(
        (typing: boolean) => {
            const channel = channelRef.current;
            if (!channel) return;
            channel.send({
                type: "broadcast",
                event: "typing",
                payload: { userId, typing },
            });
        },
        [userId]
    );

    const notifyTyping = useCallback(() => {
        const now = Date.now();
        if (now - lastSentRef.current >= THROTTLE_MS) {
            lastSentRef.current = now;
            send(true);
        }
        // Schedule a "stopped" event once the player pauses.
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => send(false), IDLE_MS);
    }, [send]);

    return { opponentTyping, notifyTyping };
}

// Presentational pulse shown in place of the static "awaiting" line.
export function TypingIndicator() {
    return (
        <div
            style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--teal-border)",
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                textAlign: "center",
            }}
        >
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
                <span
                    style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "var(--teal)",
                        boxShadow: "0 0 8px var(--teal)",
                        animation: "oracle-pulse 1s ease-in-out infinite",
                        flexShrink: 0,
                        display: "inline-block",
                    }}
                />
                <span
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "0.65rem",
                        letterSpacing: "0.22em",
                        color: "var(--text-teal)",
                        textTransform: "uppercase",
                    }}
                >
                    Opponent is typing…
                </span>
            </div>
        </div>
    );
}
