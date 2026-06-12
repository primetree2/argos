import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

export const metadata = {
    title: "Leaderboard — Argos",
};

const PODIUM_COLORS = ["var(--gold)", "#b8c0cc", "#b08d57"];

const headStyle: React.CSSProperties = {
    fontFamily: "var(--font-cinzel), serif",
    fontSize: "0.55rem",
    letterSpacing: "0.2em",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
};

export default async function LeaderboardPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let viewerUsername: string | null = null;
    if (user) {
        const { data: me } = await supabase
            .from("users")
            .select("username")
            .eq("id", user.id)
            .single();
        viewerUsername = me?.username ?? null;
    }

    const { data: players } = await supabase
        .from("users")
        .select("id, username, elo_rating, debates_won, debates_lost")
        .order("elo_rating", { ascending: false })
        .limit(50);

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar username={viewerUsername} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2.5rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ Leaderboard
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Hall of <span style={{ color: "var(--text-gold)" }}>Orators</span>
                    </h1>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {!players || players.length === 0 ? (
                    <p className="reveal-2" style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "2rem 0" }}>
                        The hall stands empty. Be the first to claim a rating.
                    </p>
                ) : (
                    <>
                        {/* Column headings */}
                        <div className="reveal-2" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0 1.25rem", marginBottom: "0.6rem" }}>
                            <span style={{ ...headStyle, width: "2.5rem", flexShrink: 0 }}>Rank</span>
                            <span style={{ ...headStyle, flex: 1 }}>Orator</span>
                            <span style={{ ...headStyle, width: "4.5rem", textAlign: "right", flexShrink: 0 }}>W / L</span>
                            <span className="lb-rate" style={{ ...headStyle, width: "3.5rem", textAlign: "right", flexShrink: 0 }}>Rate</span>
                            <span style={{ ...headStyle, width: "4rem", textAlign: "right", flexShrink: 0 }}>Elo</span>
                        </div>

                        {/* Rows */}
                        <div className="reveal-3" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {players.map((p, i) => {
                                const won = p.debates_won ?? 0;
                                const lost = p.debates_lost ?? 0;
                                const total = won + lost;
                                const rate = total > 0 ? Math.round((won / total) * 100) : 0;
                                const isViewer = viewerUsername !== null && viewerUsername === p.username;
                                const rankColor = i < 3 ? PODIUM_COLORS[i] : "var(--text-tertiary)";

                                return (
                                    <Link key={p.id} href={`/profile/${encodeURIComponent(p.username)}`} style={{ textDecoration: "none" }}>
                                        <div
                                            className="lb-row"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "1rem",
                                                padding: "0.8rem 1.25rem",
                                                background: "var(--bg-surface)",
                                                border: `1px solid ${isViewer ? "var(--gold-border-hover)" : "var(--border-default)"}`,
                                                borderRadius: "var(--radius-md)",
                                            }}
                                        >
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: rankColor, width: "2.5rem", flexShrink: 0, letterSpacing: "0.04em", textShadow: i === 0 ? "0 0 10px rgba(201,168,76,0.4)" : undefined }}>
                                                {String(i + 1).padStart(2, "0")}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-primary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {p.username}
                                                {isViewer && (
                                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", color: "var(--text-gold)", marginLeft: "0.5rem", letterSpacing: "0.1em" }}>
                                                        ◆ YOU
                                                    </span>
                                                )}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--text-secondary)", width: "4.5rem", textAlign: "right", flexShrink: 0, letterSpacing: "0.04em" }}>
                                                {won}W·{lost}L
                                            </span>
                                            <span className="lb-rate" style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--teal)", width: "3.5rem", textAlign: "right", flexShrink: 0, letterSpacing: "0.04em" }}>
                                                {rate}%
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: "var(--gold)", width: "4rem", textAlign: "right", flexShrink: 0, letterSpacing: "0.04em" }}>
                                                {p.elo_rating ?? 1200}
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>

            <style>{`
        .lb-row {
          transition: border-color 200ms ease, background 200ms ease, transform 200ms ease;
        }
        .lb-row:hover {
          border-color: var(--gold-border-hover);
          background: var(--gold-glow);
          transform: translateX(4px);
        }
        @media (max-width: 480px) {
          .lb-rate { display: none; }
        }
      `}</style>
        </div>
    );
}
