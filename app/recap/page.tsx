import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { getWeeklyRecap } from "@/lib/recap";
import { ShareRecapButton } from "@/components/recap/ShareRecapButton";

export const metadata = { title: "Your mind this week — Argos" };

export default async function RecapPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: me } = await supabase
        .from("users")
        .select("username")
        .eq("id", user.id)
        .single();

    const recap = await getWeeklyRecap(supabase, user.id);

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={me?.username ?? null} />

            <main style={{ maxWidth: "720px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ The Oracle's Reading
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.5rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Your mind <span style={{ color: "var(--text-gold)" }}>this week</span>
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                        How the Oracle read your reasoning over the last 7 days.
                    </p>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {!recap ? (
                    /* Empty week */
                    <div className="reveal-2 glass-card" style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "1.05rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                            The Oracle has nothing to read yet this week. Argue a round and your mind takes shape.
                        </p>
                        <Link href="/dashboard" className="btn-oracle" style={{ fontSize: "0.72rem", letterSpacing: "0.16em", padding: "0.8rem 1.6rem", textDecoration: "none" }}>
                            Enter the arena →
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Archetype — the identity headline */}
                        <div className="reveal-2 glass-card glass-card-gold" style={{ padding: "1.75rem 1.5rem", marginBottom: "1.25rem", textAlign: "center" }}>
                            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                                This week your mind reads as
                            </p>
                            <p className="text-shimmer" style={{ fontFamily: "var(--font-cinzel-deco), serif", fontSize: "clamp(1.6rem, 5vw, 2.2rem)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                                {recap.archetype.title}
                            </p>
                            <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "480px", margin: "0 auto" }}>
                                {recap.archetype.blurb}
                            </p>
                        </div>

                        {/* Stat grid */}
                        <div className="reveal-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1px", background: "var(--border-default)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "1.25rem" }}>
                            <RecapStat label="Arguments" value={recap.arguments} accent="var(--gold)" />
                            <RecapStat label="Avg score" value={`${recap.avgScore}/80`} accent="var(--gold)" />
                            <RecapStat label="Best" value={`${recap.bestScore}/80`} accent="var(--teal)" teal />
                            <RecapStat label="Clean rate" value={`${recap.cleanRate}%`} accent="var(--teal)" teal />
                        </div>

                        {/* Strongest dimension */}
                        <div className="reveal-4 glass-card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.2em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                                Strongest this week
                            </p>
                            <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "1.05rem", color: "var(--text-primary)" }}>
                                <span style={{ color: "var(--text-gold)" }}>{recap.strongest.label}</span>
                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: "var(--text-tertiary)" }}> · {recap.strongest.value}/20 avg</span>
                            </p>
                        </div>

                        {/* Most-committed fallacy (the sting) */}
                        {recap.topFallacy ? (
                            <div className="reveal-5 glass-card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", borderTop: "2px solid var(--red-border)" }}>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.2em", color: "var(--red-neon)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                                    Your most-committed fallacy
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "1.05rem", color: "var(--text-primary)" }}>
                                    <span style={{ color: "var(--red-neon)" }}>{recap.topFallacy.name}</span>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: "var(--text-tertiary)" }}> · ×{recap.topFallacy.count}</span>
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.9rem", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                                    Catch this one next week and your score climbs.
                                </p>
                            </div>
                        ) : (
                            <div className="reveal-5 glass-card glass-card-teal" style={{ padding: "1.1rem 1.5rem", marginBottom: "1.5rem" }}>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.92rem", color: "var(--text-teal)" }}>
                                    No fallacies caught this week. Clean reasoning across the board.
                                </p>
                            </div>
                        )}

                        {/* Share + back */}
                        <div className="reveal-6" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
                            <ShareRecapButton
                                archetype={recap.archetype.title}
                                avgScore={recap.avgScore}
                                strongest={recap.strongest.label}
                            />
                            <Link href="/dashboard" className="btn-ghost" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", padding: "0.8rem 1.4rem", textDecoration: "none" }}>
                                Back to the arena
                            </Link>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

function RecapStat({ label, value, accent, teal }: { label: string; value: string | number; accent: string; teal?: boolean }) {
    return (
        <div className="scanlines" style={{ background: "var(--bg-surface)", padding: "1.25rem 1rem", textAlign: "center", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: accent, opacity: 0.95 }} />
            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", letterSpacing: "0.2em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                {label}
            </p>
            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.5rem", color: accent, letterSpacing: "0.04em", lineHeight: 1, textShadow: teal ? "0 0 12px rgba(0,255,224,0.25)" : undefined }}>
                {value}
            </p>
        </div>
    );
}
