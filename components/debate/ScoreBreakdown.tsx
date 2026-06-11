"use client";

import { useEffect, useState } from "react";

interface Argument {
    score_clarity: number | null;
    score_evidence: number | null;
    score_logic: number | null;
    score_rebuttal: number | null;
    fallacy_penalty: number | null;
    fallacies_found: { name: string; quote: string; explanation: string }[];
    ai_feedback: string | null;
    score_total: number | null;
}

function AnimatedBar({ value, max }: { value: number; max: number }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth((value / max) * 100), 100);
        return () => clearTimeout(t);
    }, [value, max]);

    const pct = (value / max) * 100;
    const color =
        pct >= 70 ? "var(--gold)" : pct >= 40 ? "var(--gold-dim)" : "var(--text-tertiary)";
    const glow =
        pct >= 70
            ? "0 0 8px rgba(201,168,76,0.5)"
            : pct >= 40
                ? "0 0 6px rgba(138,110,46,0.3)"
                : "none";

    return (
        <div
            style={{
                flex: 1,
                height: "3px",
                background: "var(--bg-elevated)",
                borderRadius: "2px",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    height: "100%",
                    borderRadius: "2px",
                    width: `${width}%`,
                    background: color,
                    boxShadow: glow,
                    transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                }}
            />
        </div>
    );
}

function CountUp({ target }: { target: number }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        let start = 0;
        const steps = 20;
        const inc = target / steps;
        const t = setInterval(() => {
            start += inc;
            if (start >= target) { setVal(target); clearInterval(t); }
            else setVal(Math.floor(start));
        }, 30);
        return () => clearInterval(t);
    }, [target]);
    return <>{val}</>;
}

export function ScoreBreakdown({ argument: arg }: { argument: Argument }) {
    const dims = [
        { label: "Clarity", value: arg.score_clarity ?? 0, max: 20 },
        { label: "Evidence", value: arg.score_evidence ?? 0, max: 20 },
        { label: "Logic", value: arg.score_logic ?? 0, max: 20 },
        { label: "Rebuttal", value: arg.score_rebuttal ?? 0, max: 20 },
    ];

    return (
        <div
            style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-default)",
            }}
        >
            {/* Score bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
                {dims.map((d) => (
                    <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.55rem",
                                letterSpacing: "0.18em",
                                color: "var(--text-tertiary)",
                                width: "4.5rem",
                                textTransform: "uppercase",
                                flexShrink: 0,
                            }}
                        >
                            {d.label}
                        </span>
                        <AnimatedBar value={d.value} max={d.max} />
                        <span
                            style={{
                                fontFamily: "var(--font-share-tech), monospace",
                                fontSize: "0.72rem",
                                color: "var(--text-secondary)",
                                width: "2.5rem",
                                textAlign: "right",
                                flexShrink: 0,
                                letterSpacing: "0.04em",
                            }}
                        >
                            <CountUp target={d.value} />/{d.max}
                        </span>
                    </div>
                ))}
            </div>

            {/* Fallacy cards */}
            {(arg.fallacy_penalty ?? 0) < 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    {arg.fallacies_found?.map((f, i) => (
                        <div
                            key={i}
                            style={{
                                background: "var(--red-glow)",
                                border: "1px solid var(--red-border)",
                                borderRadius: "var(--radius-md)",
                                padding: "0.75rem",
                            }}
                        >
                            <p
                                style={{
                                    fontFamily: "var(--font-cinzel), serif",
                                    fontSize: "0.6rem",
                                    letterSpacing: "0.18em",
                                    color: "var(--red-neon)",
                                    textTransform: "uppercase",
                                    marginBottom: "0.4rem",
                                }}
                            >
                                ⚖ Fallacy · {f.name}
                            </p>
                            <p
                                style={{
                                    fontFamily: "var(--font-crimson), serif",
                                    fontStyle: "italic",
                                    fontSize: "0.82rem",
                                    color: "var(--text-secondary)",
                                    marginBottom: "0.3rem",
                                    paddingLeft: "0.5rem",
                                    borderLeft: "2px solid var(--red-border)",
                                }}
                            >
                                "{f.quote}"
                            </p>
                            <p
                                style={{
                                    fontFamily: "var(--font-crimson), serif",
                                    fontSize: "0.82rem",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.5,
                                }}
                            >
                                {f.explanation}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Oracle feedback */}
            {arg.ai_feedback && (
                <div
                    style={{
                        background: "var(--gold-glow)",
                        border: "1px solid var(--gold-border)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.875rem",
                        position: "relative",
                    }}
                >
                    <p
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "0.55rem",
                            letterSpacing: "0.22em",
                            color: "var(--text-gold)",
                            opacity: 0.7,
                            textTransform: "uppercase",
                            marginBottom: "0.5rem",
                        }}
                    >
                        ◆ The Oracle Speaks
                    </p>
                    <p
                        style={{
                            fontFamily: "var(--font-crimson), serif",
                            fontStyle: "italic",
                            fontSize: "0.9rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.65,
                        }}
                    >
                        {arg.ai_feedback}
                    </p>
                </div>
            )}
        </div>
    );
}