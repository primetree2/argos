import Link from "next/link";
import type { DailyTopic } from "@/lib/dailyTopic";

// Server-rendered Daily Topic feature card (#8). CSS-only hover (.daily-topic-card).
export function DailyTopicBanner({ topic }: { topic: DailyTopic | null }) {
    if (!topic) return null;

    const href = `/debate/new?topic=${encodeURIComponent(topic.title)}`;

    return (
        <div>
        <Link href={href} style={{ textDecoration: "none" }}>
            <div
                className="glass-card glass-card-gold daily-topic-card"
                style={{ padding: "1.5rem 1.6rem", display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}
            >
                <div style={{ flex: 1, minWidth: "14rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.24em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                            ◆ Topic of the Day
                        </span>
                        {topic.category && (
                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.55rem", letterSpacing: "0.16em", color: "var(--text-teal)", border: "1px solid var(--teal-border)", background: "var(--teal-glow)", borderRadius: "var(--radius-sm)", padding: "0.15rem 0.5rem", textTransform: "uppercase" }}>
                                {topic.category}
                            </span>
                        )}
                    </div>
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.05rem, 3vw, 1.35rem)", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.3, color: "var(--text-primary)" }}>
                        {topic.title}
                    </p>
                </div>
                <span
                    className="daily-topic-cta"
                    style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.7rem", letterSpacing: "0.16em", fontWeight: 600, textTransform: "uppercase", color: "var(--bg-void)", background: "var(--gold)", borderRadius: "var(--radius-md)", padding: "0.7rem 1.4rem", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                    Debate this →
                </span>
            </div>
        </Link>
        <div style={{ marginTop: "0.6rem", textAlign: "right" }}>
            <Link
                href="/daily"
                style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--text-teal)", textDecoration: "none" }}
            >
                See today’s leaderboard →
            </Link>
        </div>
        </div>
    );
}
