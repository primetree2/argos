import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { flagEmoji, countryName } from "@/lib/country";

export const metadata = {
    title: "Live Now \u2014 Argos",
    description: "Debates unfolding right now. Watch the Oracle judge live arguments as they land.",
};

// Always fresh — \"live\" must reflect the current state of active debates.
export const dynamic = "force-dynamic";

// A live (active + public) debate, with its topic and both players embedded.
interface LiveRow {
    id: string;
    status: string;
    current_round: number | null;
    total_rounds: number | null;
    blitz: boolean | null;
    player_a_side: string;
    turn_started_at: string | null;
    topic: { title: string | null; category: string | null } | null;
    player_a: { username: string | null; country: string | null } | null;
    player_b: { username: string | null; country: string | null } | null;
}

export default async function LiveNowPage() {
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

    // Active + public debates only. PostgREST embeds the topic + both players
    // via the existing FK references on the debates table — no new view needed.
    const { data: rows } = await supabase
        .from("debates")
        .select(
            "id, status, current_round, total_rounds, blitz, player_a_side, turn_started_at, topic:topics!debates_topic_id_fkey(title, category), player_a:users!debates_player_a_id_fkey(username, country), player_b:users!debates_player_b_id_fkey(username, country)"
        )
        .eq("status", "active")
        .eq("is_public", true)
        .order("turn_started_at", { ascending: false, nullsFirst: false })
        .limit(50);

    const live: LiveRow[] = (rows as unknown as LiveRow[] | null) ?? [];

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={viewerUsername} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className="live-dot" aria-hidden="true" /> Live Arena
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Live <span style={{ color: "var(--text-gold)" }}>Now</span>
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                        Debates unfolding this very moment. Step into the tribune and watch the Oracle judge.
                    </p>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {/* Live list */}
                {live.length === 0 ? (
                    <div className="reveal-3" style={{ textAlign: "center", padding: "3rem 0" }}>
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
                            The arena is quiet. No debates are live right now.
                        </p>
                        <Link href="/debate/new" className="btn-oracle" style={{ textDecoration: "none" }}>
                            Start the next one
                        </Link>
                    </div>
                ) : (
                    <div className="reveal-3" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                        {live.map((r) => {
                            const sideB = r.player_a_side === "FOR" ? "AGAINST" : "FOR";
                            const round = r.current_round ?? 1;
                            const total = r.total_rounds ?? 3;
                            return (
                                <Link key={r.id} href={`/debate/${r.id}`} style={{ textDecoration: "none" }}>
                                    <article className="glass-card glass-card-teal live-card" style={{ padding: "1.25rem 1.4rem" }}>
                                        {/* Top row: live badge + category + round */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.16em", color: "var(--text-teal)", textTransform: "uppercase" }}>
                                                <span className="live-dot" aria-hidden="true" /> Live
                                                {r.blitz && (
                                                    <span style={{ color: "var(--text-gold)", marginLeft: "0.35rem" }}>⚡ Blitz</span>
                                                )}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.08em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                {r.topic?.category ?? "General"} · Round {round}/{total}
                                            </span>
                                        </div>

                                        {/* Topic */}
                                        <h2 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1.05rem", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.3, color: "var(--text-primary)", marginBottom: "0.85rem" }}>
                                            {r.topic?.title ?? "Untitled debate"}
                                        </h2>

                                        {/* Players */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                            <span className={r.player_a_side === "FOR" ? "badge-for" : "badge-against"}>{r.player_a_side}</span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                                {flagEmoji(r.player_a?.country) && (
                                                    <span title={countryName(r.player_a?.country)} aria-label={countryName(r.player_a?.country)} style={{ fontSize: "0.95rem", lineHeight: 1 }}>{flagEmoji(r.player_a?.country)}</span>
                                                )}
                                                {r.player_a?.username ?? "Unknown"}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.75rem", color: "var(--text-tertiary)", letterSpacing: "0.1em", marginLeft: "auto", marginRight: "auto" }}>
                                                vs
                                            </span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                                {flagEmoji(r.player_b?.country) && (
                                                    <span title={countryName(r.player_b?.country)} aria-label={countryName(r.player_b?.country)} style={{ fontSize: "0.95rem", lineHeight: 1 }}>{flagEmoji(r.player_b?.country)}</span>
                                                )}
                                                {r.player_b?.username ?? "Unknown"}
                                            </span>
                                            <span className={sideB === "FOR" ? "badge-for" : "badge-against"}>{sideB}</span>
                                        </div>

                                        {/* Watch CTA */}
                                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", letterSpacing: "0.12em", color: "var(--text-teal)", textTransform: "uppercase" }}>
                                                ▸ Watch live
                                            </span>
                                        </div>
                                    </article>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </main>

            <style>{`
        .live-card {
          transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
        }
        .live-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-card), 0 0 18px var(--teal-glow);
        }
        .live-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--red-neon);
          box-shadow: 0 0 6px var(--red-neon);
          animation: live-pulse 1.6s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
        </div>
    );
}
