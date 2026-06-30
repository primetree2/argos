"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreResult } from "@/lib/ai/judge";
import type { Archetype } from "@/lib/ai/archetype";
import { track } from "@/lib/analytics";

interface RoastResult {
    score: ScoreResult;
    archetype: Archetype;
}

const SAMPLE_TAKES = [
    "Pineapple absolutely belongs on pizza and the haters can't argue with flavour.",
    "Remote work makes people more productive, full stop.",
    "Tipping culture should be abolished entirely.",
];

const DIMS: { key: keyof Pick<ScoreResult, "clarity" | "evidence" | "logic" | "rebuttal">; label: string }[] = [
    { key: "clarity", label: "Clarity" },
    { key: "evidence", label: "Evidence" },
    { key: "logic", label: "Logic" },
    { key: "rebuttal", label: "Rebuttal" },
];

// Pre-auth landing roast (ROADMAP §6.2 item 5 / §5.2 force 4 + 1). Same tuned
// verdict reveal as the authed RoastClient, but it hits the anonymous endpoint
// and ends on a SIGN-UP CTA — the taste happens before the wall, then we ask
// the now-invested visitor to save it. Kept as a separate component so the
// authed roast page is untouched.
type Phase = "idle" | "deliberating" | "reveal";

export function AnonRoastClient() {
    const [take, setTake] = useState("");
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState("");
    const [result, setResult] = useState<RoastResult | null>(null);
    const [revealStep, setRevealStep] = useState(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const clearTimers = () => {
        timers.current.forEach((t) => clearTimeout(t));
        timers.current = [];
    };
    useEffect(() => () => clearTimers(), []);

    const runReveal = useCallback(() => {
        setRevealStep(0);
        for (let i = 1; i <= DIMS.length; i++) {
            timers.current.push(setTimeout(() => setRevealStep(i), 350 * i));
        }
        timers.current.push(setTimeout(() => setRevealStep(DIMS.length + 1), 350 * (DIMS.length + 1)));
    }, []);

    const handleRoast = useCallback(async () => {
        if (take.trim().length < 12) {
            setError("Write a bit more for the Oracle to judge.");
            return;
        }
        clearTimers();
        setError("");
        setResult(null);
        setRevealStep(0);
        setPhase("deliberating");
        track("anon_roast_started");

        const startedAt = Date.now();
        try {
            const res = await fetch("/api/roast/anon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ take }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Something went wrong.");
                setPhase("idle");
                return;
            }
            const MIN_BEAT = 1800;
            const elapsed = Date.now() - startedAt;
            const wait = Math.max(0, MIN_BEAT - elapsed);
            timers.current.push(
                setTimeout(() => {
                    setResult(data as RoastResult);
                    setPhase("reveal");
                    runReveal();
                    track("anon_roast_verdict", { score: (data as RoastResult)?.score?.total ?? 0 });
                }, wait)
            );
        } catch {
            setError("The Oracle is unreachable. Check your connection and try again.");
            setPhase("idle");
        }
    }, [take, runReveal]);

    const reset = () => {
        clearTimers();
        setResult(null);
        setPhase("idle");
        setRevealStep(0);
        setError("");
    };

    return (
        <div style={{ width: "100%", maxWidth: "560px", textAlign: "left" }}>
            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.62rem", letterSpacing: "0.26em", color: "var(--text-gold)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    Try it now — no sign-up
                </span>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
            </div>

            {/* Input (hidden during reveal) */}
            {phase !== "reveal" && (
                <div className="glass-card glass-card-gold" style={{ padding: "1.5rem" }}>
                    <label style={{ display: "block", fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        Paste a take — the Oracle scores your reasoning
                    </label>
                    <textarea
                        value={take}
                        onChange={(e) => { setTake(e.target.value); if (error) setError(""); }}
                        placeholder="Paste a tweet, a hot take, or an opinion you want stress-tested…"
                        rows={4}
                        className="oracle-input"
                        style={{ resize: "none" }}
                        disabled={phase === "deliberating"}
                    />

                    <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {SAMPLE_TAKES.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTake(t)}
                                disabled={phase === "deliberating"}
                                style={{
                                    fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.8rem",
                                    padding: "0.3rem 0.75rem", background: "var(--bg-surface)",
                                    border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)",
                                    color: "var(--text-secondary)", cursor: "pointer",
                                }}
                            >
                                {t.length > 38 ? t.slice(0, 38) + "…" : t}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--red-neon)", letterSpacing: "0.06em", marginTop: "0.85rem", padding: "0.6rem 0.85rem", background: "var(--red-glow)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)" }}>
                            ⚠ {error}
                        </p>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.1rem" }}>
                        <button
                            onClick={handleRoast}
                            disabled={phase === "deliberating"}
                            className="btn-oracle"
                            style={{ fontSize: "0.72rem", letterSpacing: "0.18em", padding: "0.8rem 1.6rem" }}
                        >
                            {phase === "deliberating" ? (
                                <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;The Oracle deliberates…</>
                            ) : (
                                "Face the verdict →"
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Deliberation beat */}
            {phase === "deliberating" && (
                <div className="glass-card" style={{ padding: "2.25rem 1.5rem", textAlign: "center", marginTop: "1.25rem" }}>
                    <div style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.7rem", letterSpacing: "0.2em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                        <span style={{ animation: "oracle-pulse 1.2s ease-in-out infinite" }}>Weighing clarity · evidence · logic · rebuttal</span>
                    </div>
                </div>
            )}

            {/* Verdict reveal */}
            {phase === "reveal" && result && (
                <div>
                    <div className="glass-card glass-card-gold" style={{ padding: "1.75rem 1.5rem", marginBottom: "1.25rem", textAlign: "center", animation: "oracle-fade-in 0.4s ease both" }}>
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                            The Verdict
                        </p>
                        <div style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "3rem", lineHeight: 1, color: "var(--gold)", textShadow: "0 0 18px rgba(201,168,76,0.45)" }}>
                            {result.score.total}<span style={{ fontSize: "1.2rem", color: "var(--text-tertiary)" }}>/80</span>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                        {DIMS.map((d, i) => {
                            const shown = revealStep > i;
                            const value = result.score[d.key];
                            return (
                                <div key={d.key} style={{ marginBottom: i === DIMS.length - 1 ? 0 : "0.9rem", opacity: shown ? 1 : 0.25, transition: "opacity 300ms ease" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                                        <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.72rem", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>{d.label}</span>
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.8rem", color: "var(--text-gold)" }}>{shown ? value : 0}<span style={{ color: "var(--text-tertiary)" }}>/20</span></span>
                                    </div>
                                    <div style={{ height: "4px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: shown ? `${(value / 20) * 100}%` : "0%", background: "linear-gradient(90deg, var(--gold-dim), var(--gold))", borderRadius: "2px", transition: "width 500ms ease" }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {revealStep > DIMS.length && (
                        <div style={{ animation: "oracle-fade-in 0.4s ease both" }}>
                            {result.score.fallacies_found.length > 0 ? (
                                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.25rem", borderTop: "2px solid var(--red-border)" }}>
                                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--red-neon)", textTransform: "uppercase", marginBottom: "0.9rem" }}>
                                        Fallacies detected ({result.score.fallacies_found.length}) · {result.score.fallacy_penalty} pts
                                    </p>
                                    {result.score.fallacies_found.map((f, i) => (
                                        <div key={i} style={{ marginBottom: i === result.score.fallacies_found.length - 1 ? 0 : "1rem", paddingBottom: i === result.score.fallacies_found.length - 1 ? 0 : "1rem", borderBottom: i === result.score.fallacies_found.length - 1 ? "none" : "1px solid var(--border-default)" }}>
                                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.78rem", fontWeight: 600, color: "var(--red-neon)", marginBottom: "0.3rem" }}>{f.name}</p>
                                            {f.quote && <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>“{f.quote}”</p>}
                                            <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.85rem", color: "var(--text-tertiary)" }}>{f.explanation}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="glass-card glass-card-teal" style={{ padding: "1.1rem 1.5rem", marginBottom: "1.25rem" }}>
                                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.9rem", color: "var(--text-teal)" }}>
                                        No fallacies detected. Clean reasoning.
                                    </p>
                                </div>
                            )}

                            {/* Mind archetype (identity payload) */}
                            <div className="glass-card glass-card-gold" style={{ padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center" }}>
                                <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                                    Your mind reads as
                                </p>
                                <p className="text-shimmer" style={{ fontFamily: "var(--font-cinzel-deco), serif", fontSize: "1.6rem", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                                    {result.archetype.title}
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "460px", margin: "0 auto" }}>
                                    {result.archetype.blurb}
                                </p>
                            </div>

                            {/* The conversion CTA — invest, then sign up to save */}
                            <div className="glass-card glass-card-teal" style={{ padding: "1.5rem", marginBottom: "1.25rem", textAlign: "center" }}>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.1rem" }}>
                                    Save this verdict, earn an Elo rank, and debate real opponents — free.
                                </p>
                                <Link href="/login" className="btn-oracle" style={{ fontSize: "0.72rem", letterSpacing: "0.16em", padding: "0.8rem 1.6rem", textDecoration: "none" }}>
                                    Claim your rank →
                                </Link>
                            </div>

                            <p style={{ textAlign: "center" }}>
                                <button onClick={reset} className="btn-ghost" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", padding: "0.7rem 1.4rem" }}>
                                    Roast another
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
