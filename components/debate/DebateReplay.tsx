"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

interface Argument {
    id: string;
    user_id: string;
    round_number: number;
    content: string;
    submitted_at: string;
    score_total: number | null;
    score_clarity: number | null;
    score_evidence: number | null;
    score_logic: number | null;
    score_rebuttal: number | null;
    fallacy_penalty: number | null;
    fallacies_found: { name: string; quote: string; explanation: string }[];
    ai_feedback: string | null;
    scoring_status: string;
}

interface Debate {
    id: string;
    status: string;
    mode: string;
    player_a_id: string;
    player_b_id: string | null;
    player_a_side: string;
    winner_id: string | null;
    total_rounds: number;
    topics: { title: string; category: string | null };
    arguments: Argument[];
}

// Auto-advance interval between revealed arguments while "playing".
const STEP_MS = 2600;

export function DebateReplay({
    debate,
    currentUserId,
    username = null,
    nameMap,
}: {
    debate: Debate;
    currentUserId: string;
    username?: string | null;
    nameMap: Record<string, string>;
}) {
    // Chronological order (the query already sorts, but be defensive).
    const ordered = useMemo(
        () =>
            [...debate.arguments].sort(
                (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
            ),
        [debate.arguments]
    );

    // `step` = number of arguments revealed so far (0..ordered.length).
    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const total = ordered.length;
    const atEnd = step >= total;

    // Auto-advance while playing.
    useEffect(() => {
        if (!playing) return;
        if (atEnd) {
            setPlaying(false);
            return;
        }
        timerRef.current = setTimeout(() => setStep((s) => Math.min(total, s + 1)), STEP_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [playing, step, atEnd, total]);

    const revealed = ordered.slice(0, step);

    const isPlayerA = (uid: string) => uid === debate.player_a_id;
    const sideOf = (uid: string) =>
        isPlayerA(uid)
            ? debate.player_a_side
            : debate.player_a_side === "FOR"
                ? "AGAINST"
                : "FOR";
    const nameOf = (uid: string) =>
        uid === currentUserId ? "You" : nameMap[uid] ?? "Opponent";

    // Running tally up to the current step.
    const scoreA = revealed
        .filter((a) => a.user_id === debate.player_a_id)
        .reduce((s, a) => s + (a.score_total ?? 0), 0);
    const scoreB = revealed
        .filter((a) => a.user_id !== debate.player_a_id)
        .reduce((s, a) => s + (a.score_total ?? 0), 0);

    const aName = nameOf(debate.player_a_id);
    const bName = debate.player_b_id ? nameOf(debate.player_b_id) : "Opponent";

    const handlePlayPause = () => {
        if (atEnd) {
            // Restart from the top on play after finishing.
            setStep(0);
            setPlaying(true);
            return;
        }
        setPlaying((p) => !p);
    };

    const stepBack = () => {
        setPlaying(false);
        setStep((s) => Math.max(0, s - 1));
    };
    const stepForward = () => {
        setPlaying(false);
        setStep((s) => Math.min(total, s + 1));
    };
    const restart = () => {
        setPlaying(false);
        setStep(0);
    };

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)", display: "flex", flexDirection: "column" }}>
            <CircuitBackground intensity={0.45} />
            <Navbar username={username} hideJoinBar />

            {/* Header */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0.875rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                            ◆ Replay · {debate.mode.toUpperCase()} · {debate.total_rounds} rounds
                        </p>
                        <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(0.85rem, 2.5vw, 1.05rem)", fontWeight: 600, letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {debate.topics.title}
                        </h1>
                    </div>
                    <Link href={`/debate/${debate.id}`} className="btn-ghost" style={{ textDecoration: "none", flexShrink: 0, fontSize: "0.6rem", padding: "0.5rem 0.85rem" }}>
                        Full view →
                    </Link>
                </div>
            </div>

            {/* Score tribune (running tally) */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-glass)", backdropFilter: "blur(8px)" }}>
                <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ textAlign: "left", minWidth: "4rem" }}>
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.5rem", color: "var(--gold)", letterSpacing: "0.06em", lineHeight: 1, textShadow: "0 0 16px rgba(201,168,76,0.35)" }}>{scoreA}</p>
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.52rem", letterSpacing: "0.16em", color: "var(--text-gold)", opacity: 0.85, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "6rem" }}>{aName} · {sideOf(debate.player_a_id)}</p>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.1em", color: "var(--text-tertiary)" }}>
                            {step} / {total} arguments
                        </span>
                    </div>
                    <div style={{ textAlign: "right", minWidth: "4rem" }}>
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.5rem", color: "var(--text-secondary)", letterSpacing: "0.06em", lineHeight: 1 }}>{scoreB}</p>
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.52rem", letterSpacing: "0.16em", color: "var(--text-tertiary)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "6rem", marginLeft: "auto" }}>{bName} · {sideOf(debate.player_b_id ?? "")}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
                    <button onClick={restart} className="btn-ghost" style={{ fontSize: "0.6rem", padding: "0.45rem 0.8rem" }} aria-label="Restart replay">⏮ Restart</button>
                    <button onClick={stepBack} disabled={step === 0} className="btn-ghost" style={{ fontSize: "0.6rem", padding: "0.45rem 0.8rem", opacity: step === 0 ? 0.4 : 1 }} aria-label="Previous argument">← Prev</button>
                    <button onClick={handlePlayPause} className="btn-oracle" style={{ fontSize: "0.62rem", padding: "0.5rem 1.25rem" }} aria-label={playing ? "Pause replay" : "Play replay"}>
                        {playing ? "❚❚ Pause" : atEnd ? "↺ Replay" : "▶ Play"}
                    </button>
                    <button onClick={stepForward} disabled={atEnd} className="btn-ghost" style={{ fontSize: "0.6rem", padding: "0.45rem 0.8rem", opacity: atEnd ? 0.4 : 1 }} aria-label="Next argument">Next →</button>
                </div>
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, maxWidth: "780px", margin: "0 auto", width: "100%", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {step === 0 && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1rem", textAlign: "center" }}>
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "1rem", color: "var(--text-tertiary)" }}>
                            Press Play to relive the trial, argument by argument.
                        </p>
                    </div>
                )}

                {revealed.map((arg) => {
                    const isA = arg.user_id === debate.player_a_id;
                    return (
                        <div
                            key={arg.id}
                            className="replay-card"
                            style={{
                                background: "var(--bg-glass)",
                                backdropFilter: "blur(12px)",
                                border: `1px solid ${isA ? "var(--gold-border)" : "var(--teal-border)"}`,
                                borderTop: `2px solid ${isA ? "var(--gold)" : "var(--teal)"}`,
                                borderRadius: "var(--radius-lg)",
                                padding: "1.25rem",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                                <span className={isA ? "badge-for" : "badge-against"} style={{ fontSize: "0.55rem" }}>
                                    {nameOf(arg.user_id)} · R{arg.round_number}
                                </span>
                                {arg.scoring_status === "done" && (
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: isA ? "var(--gold)" : "var(--text-secondary)", letterSpacing: "0.06em" }}>
                                        {arg.score_total}/80
                                    </span>
                                )}
                            </div>
                            <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "68ch" }}>{arg.content}</p>
                            {arg.scoring_status === "done" && <ScoreBreakdown argument={arg} />}
                        </div>
                    );
                })}

                {/* Verdict once fully replayed */}
                {atEnd && total > 0 && (() => {
                    const winnerName =
                        debate.winner_id == null
                            ? null
                            : nameOf(debate.winner_id);
                    return (
                        <div style={{ background: "var(--gold-glow)", border: "1px solid var(--gold-border)", borderTop: "2px solid var(--gold)", borderRadius: "var(--radius-lg)", padding: "2rem 1.5rem", textAlign: "center" }}>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "1rem" }}>
                                Final Verdict
                            </p>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(0.95rem, 2.5vw, 1.15rem)", fontWeight: 600, color: "var(--gold)", letterSpacing: "0.04em" }}>
                                {winnerName == null
                                    ? "A draw — the Oracle found them equal."
                                    : `${winnerName} prevailed · ${scoreA}–${scoreB}`}
                            </p>
                        </div>
                    );
                })()}
            </div>

            <style>{`
        .replay-card { animation: replay-rise 420ms cubic-bezier(0.16,1,0.3,1); }
        @keyframes replay-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
