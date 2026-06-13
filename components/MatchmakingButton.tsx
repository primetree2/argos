"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// "Find Opponent" ranked matchmaking control (#6).
// Joins the queue, then watches for a match via Supabase Realtime on our own
// queue row, with polling as a fallback (which also re-triggers the widening
// match attempt server-side).
export function MatchmakingButton({ userId }: { userId: string }) {
    const router = useRouter();
    const supabase = createClient();
    const [searching, setSearching] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [note, setNote] = useState("");
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const tickRef = useRef<NodeJS.Timeout | null>(null);

    const goToDebate = useCallback(
        (debateId: string) => {
            cleanup();
            router.push(`/debate/${debateId}`);
        },
        [router]
    );

    const cleanup = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (tickRef.current) clearInterval(tickRef.current);
        pollRef.current = null;
        tickRef.current = null;
    }, []);

    const leave = useCallback(async () => {
        cleanup();
        setSearching(false);
        setElapsed(0);
        setNote("");
        await fetch("/api/matchmaking", { method: "DELETE" }).catch(() => { });
    }, [cleanup]);

    const start = useCallback(async () => {
        setSearching(true);
        setElapsed(0);
        setNote("");
        const res = await fetch("/api/matchmaking", { method: "POST" });
        const data = await res.json();
        if (data.matched && data.debateId) {
            goToDebate(data.debateId);
            return;
        }
        // Elapsed ticker + status messaging.
        tickRef.current = setInterval(() => {
            setElapsed((e) => {
                const next = e + 1;
                if (next === 60) setNote("Widening the search…");
                if (next === 180) setNote("Searching the whole arena…");
                return next;
            });
        }, 1000);
        // Poll fallback (also re-attempts match with widened band).
        pollRef.current = setInterval(async () => {
            const r = await fetch("/api/matchmaking");
            const d = await r.json().catch(() => ({}));
            if (d.matched && d.debateId) goToDebate(d.debateId);
        }, 4000);
    }, [goToDebate]);

    // Realtime: react the instant another player matches our row.
    useEffect(() => {
        if (!searching) return;
        const channel = supabase
            .channel(`mmq:${userId}`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "matchmaking_queue", filter: `user_id=eq.${userId}` },
                (payload) => {
                    const row = payload.new as { status: string; matched_debate_id: string | null };
                    if (row.status === "matched" && row.matched_debate_id) {
                        goToDebate(row.matched_debate_id);
                    }
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [searching, userId, goToDebate, supabase]);

    // Leave the queue if the user closes the tab while searching.
    useEffect(() => {
        if (!searching) return;
        const onUnload = () => {
            navigator.sendBeacon?.("/api/matchmaking");
        };
        window.addEventListener("beforeunload", onUnload);
        return () => window.removeEventListener("beforeunload", onUnload);
    }, [searching]);

    useEffect(() => () => cleanup(), [cleanup]);

    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    if (!searching) {
        return (
            <button
                onClick={start}
                className="glass-card action-card-primary"
                style={{ padding: "1.75rem 1.5rem", borderTop: "1px solid var(--teal)", cursor: "pointer", height: "100%", width: "100%", textAlign: "left", background: "var(--bg-glass)" }}
            >
                <div style={{ marginBottom: "0.85rem" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                </div>
                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.9rem", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                    Find Opponent
                </p>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Enter the ranked queue and be matched by Elo.
                </p>
            </button>
        );
    }

    return (
        <div
            className="glass-card"
            style={{ padding: "1.75rem 1.5rem", borderTop: "1px solid var(--teal)", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "var(--shadow-teal)" }}
        >
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)", animation: "oracle-pulse 1.4s ease-in-out infinite", display: "inline-block" }} />
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.62rem", letterSpacing: "0.2em", color: "var(--teal)", textTransform: "uppercase" }}>
                        Searching…
                    </p>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
                        {fmt(elapsed)}
                    </span>
                </div>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.85rem", fontStyle: "italic", color: "var(--text-tertiary)", lineHeight: 1.5, minHeight: "1.3rem" }}>
                    {note || "Seeking an opponent near your rating…"}
                </p>
            </div>
            <button
                onClick={leave}
                className="btn-ghost"
                style={{ marginTop: "1rem", alignSelf: "flex-start" }}
            >
                Cancel
            </button>
        </div>
    );
}
