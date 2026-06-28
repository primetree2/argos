import type { Archetype } from "@/lib/ai/archetype";

// Mind archetype identity card (ROADMAP §2.5 force 3 — identity & labeling).
//
// Server-rendered, no client JS. Shows the orator's archetype (a pure function
// of their real score pattern) as a defended, shareable identity. Below the
// reveal threshold it shows an “unrevealed” teaser so there's a reason to keep
// debating. CSS variables only; matches the Oracle Terminal aesthetic.

const DIM_LABEL: Record<string, string> = {
    clarity: "Clarity",
    evidence: "Evidence",
    logic: "Logic",
    rebuttal: "Rebuttal",
};

export function MindArchetype({
    archetype,
    scoredCount,
    minSample = 5,
    isOwnProfile = false,
}: {
    archetype: (Archetype & { sample: number }) | null;
    scoredCount: number;
    minSample?: number;
    isOwnProfile?: boolean;
}) {
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.60rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    Mind Archetype
                </span>
                <div className="gold-rule-subtle" style={{ flex: 1 }} />
            </div>

            {archetype ? (
                <div className="glass-card glass-card-gold scanlines" style={{ padding: "1.75rem 1.5rem", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.56rem", letterSpacing: "0.24em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                        The Oracle reads this mind as
                    </p>
                    <p className="text-shimmer" style={{ fontFamily: "var(--font-cinzel-deco), serif", fontSize: "clamp(1.4rem, 4vw, 2rem)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                        {archetype.title}
                    </p>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.98rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "480px", margin: "0 auto 1.25rem" }}>
                        {archetype.blurb}
                    </p>

                    <div style={{ display: "flex", justifyContent: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.1em", color: "var(--text-gold)", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-sm)", padding: "0.25rem 0.6rem", textTransform: "uppercase" }}>
                            ▲ Strength: {DIM_LABEL[archetype.strength] ?? archetype.strength}
                        </span>
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.1em", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: "0.25rem 0.6rem", textTransform: "uppercase" }}>
                            ▽ Grow: {DIM_LABEL[archetype.weakness] ?? archetype.weakness}
                        </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.55rem", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginTop: "1rem" }}>
                        Derived from {archetype.sample} scored arguments
                    </p>
                </div>
            ) : (
                <div className="glass-card" style={{ padding: "1.75rem 1.5rem", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", letterSpacing: "0.04em" }}>
                        Archetype not yet revealed
                    </p>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.92rem", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                        {isOwnProfile
                            ? `The Oracle needs ${minSample} scored arguments to read your mind. You have ${scoredCount}. Keep debating.`
                            : `Not enough scored arguments yet (${scoredCount}/${minSample}) for the Oracle to read this mind.`}
                    </p>
                </div>
            )}
        </div>
    );
}
