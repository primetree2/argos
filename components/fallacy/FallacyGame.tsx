"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FallacyRound, FallacyName } from "@/lib/fallacyGame";

// Daily "spot the fallacy" mini-game UI (ROADMAP 2.4 item 4 / 2.5 force 2).
//
// A 30-second, single-guess trial. The streak is stored CLIENT-SIDE in
// localStorage (no backend, no migration, fail-safe) and only advances once per
// UTC day, so it's a real daily-return habit surface. A timeout counts as a
// miss (loss-aversion: the streak resets). Oracle Terminal aesthetic + the
// §2.5 force-1 "held breath then reveal" pacing.

const ROUND_SECONDS = 30;
const STREAK_KEY = "argos-fallacy-streak";
const LAST_DAY_KEY = "argos-fallacy-last-day";
const PLAYED_PREFIX = "argos-fallacy-played-"; // + day -> "correct" | "wrong"

type Outcome = "correct" | "wrong";

interface StoredState {
    streak: number;
    alreadyPlayed: Outcome | null;
}

function readState(day: string): StoredState {
    if (typeof window === "undefined") return { streak: 0, alreadyPlayed: null };
    try {
        const streak = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;
        const played = localStorage.getItem(PLAYED_PREFIX + day) as Outcome | null;
        return { streak, alreadyPlayed: played };
    } catch {
        return { streak: 0, alreadyPlayed: null };
    }
}

// Returns the new streak after recording today's outcome (idempotent per day).
function recordOutcome(day: string, outcome: Outcome): number {
    if (typeof window === "undefined") return 0;
    try {
        // Don't double-count a day already played.
        const existing = localStorage.getItem(PLAYED_PREFIX + day);
        if (existing) return parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;

        const prevStreak = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;
        const lastDay = localStorage.getItem(LAST_DAY_KEY);

        let next: number;
        if (outcome === "wrong") {
            next = 0;
        } else {
            // Correct: continue the streak if yesterday was the last played day,
            // otherwise start a fresh streak at 1.
            const yesterday = new Date(Date.parse(day + "T00:00:00Z") - 86400000)
                .toISOString()
                .slice(0, 10);
            next = lastDay === yesterday ? prevStreak + 1 : 1;
        }

        localStorage.setItem(STREAK_KEY, String(next));
        localStorage.setItem(LAST_DAY_KEY, day);
        localStorage.setItem(PLAYED_PREFIX + day, outcome);
        return next;
    } catch {
        return 0;
    }
}

export function FallacyGame({ round, day }: { round: FallacyRound; day: string }) {
    const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
    const [picked, setPicked] = useState<FallacyName | null>(null);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [streak, setStreak] = useState(0);
    const [alreadyPlayed, setAlreadyPlayed] = useState<Outcome | null>(null);
    const [started, setStarted] = useState(false);
    const tick = useRef<ReturnType<typeof setInterval> | null>(null);

    // Hydrate streak + whether today was already played (client-only).
    useEffect(() => {
        const s = readState(day);
        setStreak(s.streak);
        setAlreadyPlayed(s.alreadyPlayed);
    }, [day]);

    const stopTimer = useCallback(() => {
        if (tick.current) {
            clearInterval(tick.current);
            tick.current = null;
        }
    }, []);

    const finish = useCallback(
        (choice: FallacyName | null) => {
            stopTimer();
            const result: Outcome = choice === round.answer ? "correct" : "wrong";
            setPicked(choice);
            setOutcome(result);
            const newStreak = recordOutcome(day, result);
            setStreak(newStreak);
            setAlreadyPlayed(result);
        },
        [day, round.answer, stopTimer]
    );

    // Countdown (only while playing).
    useEffect(() => {
        if (!started || outcome) return;
        tick.current = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    // Time's up -> auto-miss.
                    finish(null);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return stopTimer;
    }, [started, outcome, finish, stopTimer]);

    const start = () => {
        setSecondsLeft(ROUND_SECONDS);
        setStarted(true);
    };

    const shareText =
        outcome === "correct"
            ? `I spotted today's fallacy on Argos — ${streak}-day streak. Can you?`
            : "I just tested how my mind handles logical fallacies on Argos. Try today's:";
    const shareUrl =
        typeof window !== "undefined" ? `${window.location.origin}/fallacy` : "https://argos-indol.vercel.app/fallacy";
    const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

    const timerColor =
        secondsLeft > 10 ? "var(--text-gold)" : secondsLeft > 5 ? "#e0a23c" : "var(--red-neon)";

    return (
        <>
            {/* Header */}
            <div className="reveal-1" style={{ marginBottom: "1.75rem" }}>
                <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                    ◆ Daily Trial
                </p>
                <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.5rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                    Spot the <span style={{ color: "var(--text-gold)" }}>fallacy</span>
                </h1>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                    One statement. One hidden flaw. Thirty seconds. Name it.
                </p>
                {/* Streak surface (§2.5 force 2) */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.9rem" }}>
                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", letterSpacing: "0.12em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                        Streak
                    </span>
                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: streak > 0 ? "var(--gold)" : "var(--text-tertiary)", letterSpacing: "0.04em" }}>
                        {streak > 0 ? `🔥 ${streak}` : "—"}
                    </span>
                </div>
                <div style={{ marginTop: "1rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
            </div>

            {/* Already played today (and not in this session) */}
            {alreadyPlayed && !outcome ? (
                <div className="reveal-2 glass-card glass-card-gold" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1.05rem", fontWeight: 600, color: alreadyPlayed === "correct" ? "var(--text-gold)" : "var(--text-secondary)", marginBottom: "0.6rem" }}>
                        {alreadyPlayed === "correct" ? "You solved today's trial." : "You've played today's trial."}
                    </p>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.92rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
                        A new fallacy appears at 00:00 UTC. {streak > 0 ? `Keep your 🔥 ${streak}-day streak alive.` : ""}
                    </p>
                    <a href={tweetHref} target="_blank" rel="noopener noreferrer" className="btn-oracle" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", padding: "0.7rem 1.4rem", textDecoration: "none" }}>
                        Challenge a friend →
                    </a>
                </div>
            ) : !started ? (
                /* Start gate */
                <div className="reveal-2 glass-card" style={{ padding: "2.25rem 1.5rem", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
                        When you start, the clock runs for {ROUND_SECONDS} seconds. One guess. No going back.
                    </p>
                    <button onClick={start} className="btn-oracle" style={{ fontSize: "0.74rem", letterSpacing: "0.18em", padding: "0.85rem 1.8rem" }}>
                        Begin the trial →
                    </button>
                </div>
            ) : (
                <>
                    {/* Timer + statement */}
                    <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                        {!outcome && (
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: timerColor, letterSpacing: "0.08em" }}>
                                    {String(secondsLeft).padStart(2, "0")}s
                                </span>
                            </div>
                        )}
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "1.15rem", lineHeight: 1.55, color: "var(--text-primary)" }}>
                            “{round.statement}”
                        </p>
                    </div>

                    {/* Options */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "1.25rem" }}>
                        {round.options.map((opt) => {
                            const isAnswer = opt === round.answer;
                            const isPicked = opt === picked;
                            let border = "var(--border-default)";
                            let bg = "var(--bg-surface)";
                            let color = "var(--text-secondary)";
                            if (outcome) {
                                if (isAnswer) {
                                    border = "var(--gold-border-hover)"; bg = "var(--gold-glow)"; color = "var(--text-gold)";
                                } else if (isPicked) {
                                    border = "var(--red-border)"; bg = "var(--red-glow)"; color = "var(--red-neon)";
                                }
                            }
                            return (
                                <button
                                    key={opt}
                                    onClick={() => !outcome && finish(opt)}
                                    disabled={Boolean(outcome)}
                                    className="fallacy-option"
                                    style={{
                                        fontFamily: "var(--font-cinzel), serif", fontSize: "0.8rem", fontWeight: 600,
                                        letterSpacing: "0.03em", textAlign: "left",
                                        padding: "0.9rem 1rem", border: `1px solid ${border}`,
                                        background: bg, color, borderRadius: "var(--radius-md)",
                                        cursor: outcome ? "default" : "pointer", transition: "all 160ms ease",
                                    }}
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>

                    {/* Reveal */}
                    {outcome && (
                        <div style={{ animation: "oracle-fade-in 0.4s ease both" }}>
                            <div
                                className={`glass-card ${outcome === "correct" ? "glass-card-gold" : ""}`}
                                style={{ padding: "1.5rem", marginBottom: "1.25rem", borderTop: outcome === "correct" ? "2px solid var(--gold-border)" : "2px solid var(--red-border)" }}
                            >
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.95rem", fontWeight: 700, letterSpacing: "0.04em", color: outcome === "correct" ? "var(--text-gold)" : "var(--red-neon)", marginBottom: "0.6rem" }}>
                                    {outcome === "correct" ? "◆ Correct" : picked ? "✗ Not quite" : "⏱ Time's up"}
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                    It's <strong style={{ color: "var(--text-gold)" }}>{round.answer}</strong>. {round.explanation}
                                </p>
                            </div>

                            <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.7rem", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
                                    {outcome === "correct"
                                        ? streak > 1 ? `🔥 ${streak}-day streak` : "Streak started — come back tomorrow"
                                        : "Streak reset — try again tomorrow"}
                                </span>
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
                                <a href={tweetHref} target="_blank" rel="noopener noreferrer" className="btn-oracle" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", padding: "0.7rem 1.4rem", textDecoration: "none" }}>
                                    Share →
                                </a>
                                <a href="/roast" className="btn-ghost" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", padding: "0.7rem 1.4rem", textDecoration: "none" }}>
                                    Roast a take
                                </a>
                            </div>
                        </div>
                    )}
                </>
            )}

            <style>{`
        .fallacy-option:not(:disabled):hover {
          border-color: var(--gold-border-hover);
          color: var(--text-gold);
          transform: translateY(-1px);
        }
      `}</style>
        </>
    );
}
