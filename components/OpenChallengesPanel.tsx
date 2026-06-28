import Link from "next/link";
import type { OpenChallengeSummary } from "@/lib/challenges";

// Dashboard Open-Challenges discovery panel (ROADMAP 2.4 item 2 follow-up,
// 2.5 force 5: kill the blank-page tax). Server-rendered; renders NOTHING when
// there are no open challenges so it never leaves dead space on the dashboard.
export function OpenChallengesPanel({ challenges }: { challenges: OpenChallengeSummary[] }) {
    if (!challenges || challenges.length === 0) return null;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.24em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                    ◆ Open Challenges
                </span>
                <Link
                    href="/challenges"
                    style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--text-teal)", textDecoration: "none" }}
                >
                    See all →
                </Link>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {challenges.map((c) => (
                    <Link key={c.id} href="/challenges" style={{ textDecoration: "none" }}>
                        <div
                            className="glass-card open-challenge-row"
                            style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
                        >
                            <div style={{ flex: 1, minWidth: "12rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.56rem", letterSpacing: "0.14em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                        {c.category ?? "General"}
                                    </span>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.56rem", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                                        · {c.creator ?? "Unknown"}{c.creatorElo != null ? ` · ${c.creatorElo} Elo` : ""}
                                    </span>
                                </div>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.92rem", fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1.3, color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                                    {c.topicTitle}
                                </p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.54rem", letterSpacing: "0.1em", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: "0.18rem 0.45rem", textTransform: "uppercase" }}>
                                        {c.rounds} rounds
                                    </span>
                                    {c.blitz && (
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.54rem", letterSpacing: "0.1em", color: "var(--text-teal)", border: "1px solid var(--teal-border)", borderRadius: "var(--radius-sm)", padding: "0.18rem 0.45rem", textTransform: "uppercase" }}>
                                            ⚡ Blitz
                                        </span>
                                    )}
                                    {c.reusable && (
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.54rem", letterSpacing: "0.1em", color: "var(--text-gold)", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-sm)", padding: "0.18rem 0.45rem", textTransform: "uppercase" }}>
                                            ♾ Reusable
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span
                                className="open-challenge-cta"
                                style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.66rem", letterSpacing: "0.14em", fontWeight: 600, textTransform: "uppercase", color: "var(--text-gold)", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-md)", padding: "0.55rem 1.1rem", whiteSpace: "nowrap", flexShrink: 0 }}
                            >
                                Accept →
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
