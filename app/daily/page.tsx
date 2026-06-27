import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { getDailyLeaderboard } from "@/lib/cache/dailyLeaderboard";

export const metadata = {
    title: "Topic of the Day \u2014 Argos",
    description: "Today\u2019s Daily Topic and the leaderboard of everyone who has debated it.",
};

const PODIUM_COLORS = ["var(--gold)", "#b8c0cc", "#b08d57"];

export default async function DailyLeaderboardPage() {
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

    const board = await getDailyLeaderboard();
    const href = board.title
        ? `/debate/new?topic=${encodeURIComponent(board.title)}`
        : "/debate/new";

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={viewerUsername} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ Topic of the Day
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.4rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.2 }}>
                        {board.title ?? "No topic set yet today"}
                    </h1>
                    {board.category && (
                        <span style={{ display: "inline-block", marginTop: "0.6rem", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.16em", color: "var(--text-teal)", border: "1px solid var(--teal-border)", background: "var(--teal-glow)", borderRadius: "var(--radius-sm)", padding: "0.2rem 0.6rem", textTransform: "uppercase" }}>
                            {board.category}
                        </span>
                    )}
                    <div style={{ marginTop: "1.1rem" }}>
                        <Link href={href} className="btn-oracle" style={{ textDecoration: "none", fontSize: "0.72rem", letterSpacing: "0.16em", padding: "0.7rem 1.4rem" }}>
                            Debate this →
                        </Link>
                    </div>
                    <div style={{ marginTop: "1.1rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {/* Board */}
                {board.entries.length === 0 ? (
                    <p className="reveal-2" style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "2.5rem 0" }}>
                        {board.title
                            ? "No completed debates on today\u2019s topic yet. Be the first to claim the top spot."
                            : "Today\u2019s topic hasn\u2019t been generated yet. Check back soon."}
                    </p>
                ) : (
                    <div className="reveal-2" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {board.entries.map((e, i) => {
                            const isViewer = viewerUsername !== null && viewerUsername === e.username;
                            const rankColor = i < 3 ? PODIUM_COLORS[i] : "var(--text-tertiary)";
                            return (
                                <Link key={e.userId} href={`/profile/${encodeURIComponent(e.username)}`} style={{ textDecoration: "none" }}>
                                    <div
                                        className="daily-row"
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
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: rankColor, width: "2.5rem", flexShrink: 0, letterSpacing: "0.04em" }}>
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                        <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-primary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {e.username}
                                            {isViewer && (
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", color: "var(--text-gold)", marginLeft: "0.5rem", letterSpacing: "0.1em" }}>
                                                    ◆ YOU
                                                </span>
                                            )}
                                        </span>
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--text-secondary)", width: "5rem", textAlign: "right", flexShrink: 0, letterSpacing: "0.04em" }}>
                                            {e.wins}W · {e.debates}d
                                        </span>
                                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: "var(--gold)", width: "4rem", textAlign: "right", flexShrink: 0, letterSpacing: "0.04em" }}>
                                            {e.score}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </main>

            <style>{`
        .daily-row { transition: border-color 200ms ease, background 200ms ease, transform 200ms ease; }
        .daily-row:hover { border-color: var(--gold-border-hover); background: var(--gold-glow); transform: translateX(4px); }
      `}</style>
        </div>
    );
}
