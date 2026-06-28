"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// "Find Opponent" ranked matchmaking control (#6).
// Joins the queue, then watches for a match via Supabase Realtime on our own
// queue row, with polling as a fallback (which also re-triggers the widening
// match attempt server-side).
//
// `blitz` turns this into the Phase 4 "Quick Match" variant: it asks the server
// to pair into a fast Blitz debate (90s turns). Title/description/accent are
// overridable so the same component serves both cards.
//
// UX goals (make random matching FEEL smooth + fast even when the network or
// the opponent lag):
//   - Poll fast early (1.5s for the first ~20s, then 4s). Most matches happen
//     quickly, so a tight early cadence makes pairing feel near-instant without
//     hammering the API for the long tail.
//   - When a match lands (Realtime OR poll OR the initial POST), DON'T redirect
//     abruptly: show a brief "Opponent found — entering the arena" success
//     flash, then navigate. The handoff reads as intentional, not janky.
//   - Surface gentle, staged status text + an animated shimmer so the wait
//     looks like active progress.

// Poll cadence: tight early window, relaxed afterwards.
const FAST_POLL_MS = 1500;
const SLOW_POLL_MS = 4000;
const FAST_POLL_UNTIL_MS = 20000;
// How long the "Opponent found" flash shows before we navigate.
const FOUND_FLASH_MS = 900;

export function MatchmakingButton({
    userId,
    blitz = false,
    title,
    description,
    accent = "var(--teal)",
}: {
    userId: string;
    blitz?: boolean;
    title?: string;
    description?: string;
    accent?: string;
}) {
    const router = useRouter();
    const supabase = createClient();
    const [searching, setSearching] = useState(false);
    const [found, setFound] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [note, setNote] = useState("");
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const tickRef = useRef<NodeJS.Timeout | null>(null);
    // Guards so the match handoff only ever fires once even if Realtime and the
    // poll resolve at nearly the same moment.
    const handledRef = useRef(false);

    const cleanup = useCallback(() => {
        if (pollRef.current) clearTimeout(pollRef.current);
        if (tickRef.current) clearInterval(tickRef.current);
        pollRef.current = null;
        tickRef.current = null;
    }, []);

    // Single entry point for a successful match: stop timers, show the success
    // flash, then navigate. Idempotent via handledRef.
    const onMatched = useCallback(
        (debateId: string) => {
            if (handledRef.current) return;
            handledRef.current = true;
            cleanup();
            setFound(true);
            setNote("Opponent found — entering the arena");
            setTimeout(() => {
                router.push(`/debate/${debateId}`);
            }, FOUND_FLASH_MS);
        },
        [cleanup, router]
    );

    const leave = useCallback(async () => {
        cleanup();
        setSearching(false);
        setFound(false);
        setElapsed(0);
        setNote("");
        handledRef.current = false;
        await fetch("/api/matchmaking", { method: "DELETE" }).catch(() => { });
    }, [cleanup]);

    // Mirror `elapsed` into a ref so the poll scheduler can read it without
    // re-subscribing every tick.
    const elapsedRef = useRef(0);
    useEffect(() => {
        elapsedRef.current = elapsed;
    }, [elapsed]);

    // Self-scheduling poll with a variable interval (fast early, slow later).
    // Uses setTimeout (not setInterval) so the interval can change per tick.
    const scheduleNextPoll = useCallback(
        (delay: number) => {
            pollRef.current = setTimeout(async () => {
                try {
                    const r = await fetch(`/api/matchmaking${blitz ? "?blitz=1" : ""}`);
                    const d = await r.json().catch(() => ({}));
                    if (d.matched && d.debateId) {
                        onMatched(d.debateId);
                        return;
                    }
                } catch {
                    /* transient — next tick retries */
                }
                if (handledRef.current) return;
                // Decide the next cadence from how long we've been waiting.
                const next = elapsedRef.current * 1000 < FAST_POLL_UNTIL_MS ? FAST_POLL_MS : SLOW_POLL_MS;
                scheduleNextPoll(next);
            }, delay);
        },
        [blitz, onMatched]
    );

    const start = useCallback(async () => {
        handledRef.current = false;
        setSearching(true);
        setFound(false);
        setElapsed(0);
        setNote("");
        let data: { matched?: boolean; debateId?: string } = {};
        try {
            const res = await fetch("/api/matchmaking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blitz }),
            });
            data = await res.json().catch(() => ({}));
        } catch {
            /* fall through to polling */
        }
        if (data.matched && data.debateId) {
            onMatched(data.debateId);
            return;
        }
        // Elapsed ticker + gentle staged status messaging.
        tickRef.current = setInterval(() => {
            setElapsed((e) => {
                const next = e + 1;
                if (next === 5) setNote("Scanning the arena for a worthy opponent…");
                if (next === 30) setNote("Widening the search…");
                if (next === 90) setNote("Searching the whole arena…");
                return next;
            });
        }, 1000);
        // Begin the fast poll loop (also re-attempts the match with a widened
        // band server-side).
        scheduleNextPoll(FAST_POLL_MS);
    }, [blitz, onMatched, scheduleNextPoll]);

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
                        onMatched(row.matched_debate_id);
                    }
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [searching, userId, onMatched, supabase]);

    // Leave the queue if the user closes the tab while searching (but not once
    // a match is found and we're navigating into it).
    useEffect(() => {
        if (!searching || found) return;
        const onUnload = () => {
            navigator.sendBeacon?.("/api/matchmaking");
        };
        window.addEventListener("beforeunload", onUnload);
        return () => window.removeEventListener("beforeunload", onUnload);
    }, [searching, found]);

    useEffect(() => () => cleanup(), [cleanup]);

    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    if (!searching) {
        return (
            <button
                onClick={start}
                className="glass-card action-card-primary"
                style={{ padding: "1.75rem 1.5rem", borderTop: `1px solid ${accent}`, cursor: "pointer", height: "100%", width: "100%", textAlign: "left", background: "var(--bg-glass)" }}
            >
                <div style={{ marginBottom: "0.85rem" }}>
                    {blitz ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                        </svg>
                    ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                    )}
                </div>
                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.9rem", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                    {title ?? "Find Opponent"}
                </p>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {description ?? "Enter the ranked queue and be matched by Elo."}
                </p>
            </button>
        );
    }

    // ── Searching / Found panel ──
    const flashAccent = found ? "var(--gold)" : accent;
    return (
        <div
            className="glass-card"
            style={{ padding: "1.75rem 1.5rem", borderTop: `1px solid ${flashAccent}`, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: found ? "var(--shadow-gold)" : "var(--shadow-teal)", transition: "box-shadow 300ms ease, border-color 300ms ease" }}
        >
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: flashAccent, boxShadow: `0 0 8px ${flashAccent}`, animation: `oracle-pulse ${found ? "0.8s" : "1.4s"} ease-in-out infinite`, display: "inline-block" }} />
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.62rem", letterSpacing: "0.2em", color: flashAccent, textTransform: "uppercase" }}>
                        {found ? "Matched" : blitz ? "Quick matching…" : "Searching…"}
                    </p>
                    {!found && (
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
                            {fmt(elapsed)}
                        </span>
                    )}
                </div>

                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.85rem", fontStyle: "italic", color: found ? "var(--text-gold)" : "var(--text-tertiary)", lineHeight: 1.5, minHeight: "1.3rem" }}>
                    {note || "Seeking an opponent near your rating…"}
                </p>

                {/* Animated progress shimmer — reads as active progress while we
                    wait, and becomes a solid "connecting" bar once found. */}
                <div style={{ marginTop: "0.85rem", height: "2px", borderRadius: "2px", background: "var(--bg-elevated)", overflow: "hidden" }}>
                    <div
                        className={found ? "mm-bar-found" : "mm-bar-shimmer"}
                        style={{ height: "100%", borderRadius: "2px", background: `linear-gradient(90deg, transparent, ${flashAccent}, transparent)` }}
                    />
                </div>
            </div>

            {!found && (
                <button
                    onClick={leave}
                    className="btn-ghost"
                    style={{ marginTop: "1rem", alignSelf: "flex-start" }}
                >
                    Cancel
                </button>
            )}

            <style>{`
                .mm-bar-shimmer {
                    width: 40%;
                    animation: mm-shimmer 1.2s ease-in-out infinite;
                }
                @keyframes mm-shimmer {
                    0% { transform: translateX(-120%); }
                    100% { transform: translateX(320%); }
                }
                .mm-bar-found {
                    width: 100%;
                    background-size: 200% 100% !important;
                    animation: mm-fill 0.9s ease forwards;
                }
                @keyframes mm-fill {
                    0% { opacity: 0.5; transform: scaleX(0.2); transform-origin: left; }
                    100% { opacity: 1; transform: scaleX(1); transform-origin: left; }
                }
            `}</style>
        </div>
    );
}
