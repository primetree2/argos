import { computeBadges, sortBadgesEarnedFirst, type AchievementInput } from "@/lib/achievements";

// Achievements grid for the profile page (ROADMAP Phase 3, FREE).
// Pure server component — no client JS. Earned badges glow; locked badges are
// dimmed with their unlock condition shown, so they double as goals. Colours
// are CSS variables only, per the Oracle Terminal design system.
export function Achievements({ input }: { input: AchievementInput }) {
    const badges = sortBadgesEarnedFirst(computeBadges(input));
    const earnedCount = badges.filter((b) => b.earned).length;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
                <span
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "0.60rem",
                        letterSpacing: "0.28em",
                        color: "var(--text-gold)",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                    }}
                >
                    Honours · {earnedCount}/{badges.length}
                </span>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
            </div>

            <div
                className="achievements-grid"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: "0.75rem",
                }}
            >
                {badges.map((b) => (
                    <div
                        key={b.id}
                        title={b.description}
                        aria-label={`${b.label}: ${b.description} — ${b.earned ? "earned" : "locked"}`}
                        style={{
                            position: "relative",
                            background: b.earned ? "var(--bg-surface)" : "var(--bg-void)",
                            border: `1px solid ${b.earned ? "var(--gold-border)" : "var(--border-default)"}`,
                            borderRadius: "var(--radius-md)",
                            padding: "1rem 0.9rem",
                            opacity: b.earned ? 1 : 0.5,
                            boxShadow: b.earned ? "var(--shadow-gold-sm)" : "none",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "1.4rem",
                                lineHeight: 1,
                                marginBottom: "0.5rem",
                                color: b.earned ? b.color : "var(--text-tertiary)",
                                filter: b.earned ? "drop-shadow(0 0 8px rgba(201,168,76,0.35))" : "grayscale(1)",
                            }}
                            aria-hidden="true"
                        >
                            {b.icon}
                        </div>
                        <p
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                color: b.earned ? "var(--text-primary)" : "var(--text-tertiary)",
                                marginBottom: "0.3rem",
                            }}
                        >
                            {b.label}
                        </p>
                        <p
                            style={{
                                fontFamily: "var(--font-crimson), serif",
                                fontSize: "0.72rem",
                                fontStyle: "italic",
                                color: "var(--text-tertiary)",
                                lineHeight: 1.4,
                            }}
                        >
                            {b.description}
                        </p>
                        {b.earned && (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: "absolute",
                                    top: "0.55rem",
                                    right: "0.6rem",
                                    fontFamily: "var(--font-share-tech), monospace",
                                    fontSize: "0.6rem",
                                    color: "var(--gold)",
                                }}
                            >
                                ✓
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
