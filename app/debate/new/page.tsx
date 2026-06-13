"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

const SAMPLE_TOPICS = [
    "Social media does more harm than good",
    "AI will eliminate more jobs than it creates",
    "Universal basic income should be implemented globally",
    "Space exploration is worth the cost",
    "Homework should be abolished in schools",
];

export default function NewDebatePage() {
    const router = useRouter();
    const [topic, setTopic] = useState("");
    const [mode, setMode] = useState<"casual" | "ranked">("casual");
    const [rounds, setRounds] = useState(3);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Prefill from ?topic= (e.g. the Daily Topic "Debate this" CTA). Read from
    // the URL on mount to avoid a Suspense boundary around useSearchParams.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const preset = params.get("topic");
        if (preset) setTopic(preset);
    }, []);

    const handleCreate = async () => {
        if (!topic.trim()) {
            setError("Enter a topic to continue.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/debates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, mode, totalRounds: rounds }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Something went wrong.");
                setLoading(false);
                return;
            }

            router.push(`/debate/${data.debate.id}`);
        } catch {
            setError("The Oracle is unreachable. Check your connection and try again.");
            setLoading(false);
        }
    };

    const wordCount = topic.trim() ? topic.trim().split(/\s+/).length : 0;

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar />

            <main style={{ maxWidth: "560px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>

                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2.5rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", opacity: 1, textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ New Debate
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.4rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "0.3rem" }}>
                        Configure the Trial
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                        Choose your topic. The Oracle will judge every word.
                    </p>
                </div>

                {/* ── Topic ── */}
                <div className="reveal-2" style={{ marginBottom: "1.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                        <label style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", opacity: 0.9, textTransform: "uppercase" }}>
                            Topic
                        </label>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                            {wordCount} {wordCount === 1 ? "word" : "words"}
                        </span>
                    </div>

                    <textarea
                        value={topic}
                        onChange={(e) => { setTopic(e.target.value); if (error) setError(""); }}
                        placeholder="State your debate topic clearly…"
                        rows={3}
                        className="oracle-input"
                        style={{ resize: "none" }}
                    />

                    {/* Sample topic chips */}
                    <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {SAMPLE_TOPICS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTopic(t)}
                                style={{
                                    fontFamily: "var(--font-crimson), serif",
                                    fontStyle: "italic",
                                    fontSize: "0.8rem",
                                    padding: "0.3rem 0.75rem",
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "var(--radius-sm)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    transition: "color 150ms ease, border-color 150ms ease, background 150ms ease",
                                }}
                                onMouseEnter={(e) => {
                                    const el = e.currentTarget as HTMLButtonElement;
                                    el.style.color = "var(--text-gold)";
                                    el.style.borderColor = "var(--gold-border-hover)";
                                    el.style.background = "var(--gold-glow)";
                                }}
                                onMouseLeave={(e) => {
                                    const el = e.currentTarget as HTMLButtonElement;
                                    el.style.color = "var(--text-secondary)";
                                    el.style.borderColor = "var(--border-default)";
                                    el.style.background = "var(--bg-surface)";
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Mode ── */}
                <div className="reveal-3" style={{ marginBottom: "1.75rem" }}>
                    <label style={{ display: "block", fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", opacity: 0.9, textTransform: "uppercase", marginBottom: "0.7rem" }}>
                        Mode
                    </label>
                    <div className="mode-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        {(["casual", "ranked"] as const).map((m) => {
                            const active = mode === m;
                            const isRanked = m === "ranked";
                            return (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    style={{
                                        background: active ? (isRanked ? "var(--gold-glow)" : "rgba(0,255,224,0.06)") : "var(--bg-surface)",
                                        border: `1px solid ${active ? (isRanked ? "var(--gold-border-hover)" : "var(--teal-border)") : "var(--border-default)"}`,
                                        borderTop: active ? `2px solid ${isRanked ? "var(--gold)" : "var(--teal)"}` : "2px solid transparent",
                                        borderRadius: "var(--radius-lg)",
                                        padding: "1.25rem",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        transition: "all 200ms ease",
                                        boxShadow: active ? (isRanked ? "var(--shadow-gold-sm)" : "var(--shadow-teal)") : "none",
                                    }}
                                >
                                    <p style={{
                                        fontFamily: "var(--font-cinzel), serif",
                                        fontSize: "0.82rem",
                                        fontWeight: 600,
                                        letterSpacing: "0.08em",
                                        textTransform: "capitalize",
                                        color: active ? (isRanked ? "var(--text-gold)" : "var(--teal)") : "var(--text-primary)",
                                        marginBottom: "0.35rem",
                                    }}>
                                        {m}
                                    </p>
                                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                        {m === "casual" ? "No Elo changes. Stakes are low." : "Elo rating affected. Glory or ruin."}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Rounds ── */}
                <div className="reveal-4" style={{ marginBottom: "2.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
                        <label style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", opacity: 0.9, textTransform: "uppercase" }}>
                            Rounds
                        </label>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.1rem", color: "var(--gold)", letterSpacing: "0.1em", textShadow: "0 0 10px rgba(201,168,76,0.4)" }}>
                            {rounds}
                        </span>
                    </div>

                    {/* Custom styled range */}
                    <style>{`
            .oracle-range { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; background: var(--bg-elevated); border-radius: 2px; outline: none; cursor: pointer; }
            .oracle-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--gold); border: 2px solid var(--bg-void); box-shadow: 0 0 10px rgba(201,168,76,0.5); cursor: pointer; transition: transform 150ms ease, box-shadow 150ms ease; }
            .oracle-range::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 0 16px rgba(201,168,76,0.7); }
            .oracle-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--gold); border: 2px solid var(--bg-void); box-shadow: 0 0 10px rgba(201,168,76,0.5); cursor: pointer; }
          `}</style>

                    <input
                        type="range" min={2} max={5} value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                        className="oracle-range"
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem" }}>
                        {[2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", color: rounds === n ? "var(--gold)" : "var(--text-tertiary)", letterSpacing: "0.06em", transition: "color 150ms ease" }}>
                                {n}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--red-neon)", letterSpacing: "0.06em", marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "var(--red-glow)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)" }}>
                        ⚠ {error}
                    </p>
                )}

                {/* Submit */}
                <div className="reveal-5">
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="btn-oracle"
                        style={{ width: "100%", padding: "1rem", fontSize: "0.78rem", letterSpacing: "0.2em", justifyContent: "center" }}
                    >
                        {loading ? (
                            <>
                                <span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>
                                &nbsp;Convening the Oracle…
                            </>
                        ) : (
                            "Commence the Trial →"
                        )}
                    </button>
                </div>

            </main>
        </div>
    );
}