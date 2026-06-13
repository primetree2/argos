import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

export const metadata = {
    title: "Public Debates \u2014 Argos",
    description: "Read completed debates judged by the Oracle. Topics, scores, winners, and the fallacies that decided them.",
};

// Always fetch fresh — the feed reflects newly completed debates.
export const dynamic = "force-dynamic";

type Filter = "recent" | "discussed" | "category";

interface FeedRow {
    id: string;
    topicTitle: string;
    category: string | null;
    playerA: string | null;
    playerB: string | null;
    sideA: string;
    scoreA: number;
    scoreB: number;
    winner: string | null;
    argCount: number;
    topFallacy: string | null;
    createdAt: string | null;
}

const FILTERS: { key: Filter; label: string }[] = [
    { key: "recent", label: "Recent" },
    { key: "discussed", label: "Most Discussed" },
    { key: "category", label: "By Category" },
];

export default async function PublicDebatesPage({
    searchParams,
}: {
    searchParams: Promise<{ filter?: string; category?: string }>;
}) {
    const params = await searchParams;
    const filter: Filter =
        params.filter === "discussed" || params.filter === "category"
            ? params.filter
            : "recent";
    const activeCategory = params.category ?? null;

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

    // Completed, public debates. Treat NULL is_public as public so debates that
    // predate the is_public column remain visible (never silently hide content).
    const { data: debates } = await supabase
        .from("debates")
        .select(
            "id, player_a_id, player_b_id, player_a_side, winner_id, is_public, created_at, topics (title, category)"
        )
        .eq("status", "completed")
        .or("is_public.is.null,is_public.eq.true")
        .order("created_at", { ascending: false })
        .limit(120);

    const rows: FeedRow[] = [];
    const categories = new Set<string>();

    if (debates && debates.length > 0) {
        // Gather every participant id for a single username lookup.
        const userIds = Array.from(
            new Set(
                debates
                    .flatMap((d) => [d.player_a_id, d.player_b_id])
                    .filter((id): id is string => Boolean(id))
            )
        );
        const nameMap = new Map<string, string>();
        if (userIds.length > 0) {
            const { data: people } = await supabase
                .from("users")
                .select("id, username")
                .in("id", userIds);
            for (const p of people ?? []) nameMap.set(p.id, p.username);
        }

        // Gather scoring data for every debate in one query.
        const debateIds = debates.map((d) => d.id);
        const { data: args } = await supabase
            .from("arguments")
            .select("debate_id, user_id, score_total, fallacy_penalty, fallacies_found")
            .in("debate_id", debateIds);

        type ArgAgg = {
            scores: Map<string, number>;
            count: number;
            topFallacy: string | null;
            topPenalty: number;
        };
        const aggMap = new Map<string, ArgAgg>();
        for (const a of args ?? []) {
            let agg = aggMap.get(a.debate_id);
            if (!agg) {
                agg = { scores: new Map(), count: 0, topFallacy: null, topPenalty: 0 };
                aggMap.set(a.debate_id, agg);
            }
            agg.count += 1;
            if (a.user_id) {
                agg.scores.set(
                    a.user_id,
                    (agg.scores.get(a.user_id) ?? 0) + (a.score_total ?? 0)
                );
            }
            // Track the single heaviest fallacy across the debate.
            const fallacies = Array.isArray(a.fallacies_found)
                ? (a.fallacies_found as Array<{ name?: string }>)
                : [];
            const penalty = a.fallacy_penalty ?? 0;
            if (fallacies.length > 0 && penalty >= agg.topPenalty) {
                agg.topPenalty = penalty;
                agg.topFallacy = fallacies[0]?.name ?? agg.topFallacy;
            }
        }

        for (const d of debates) {
            const topic = d.topics as unknown as { title: string; category: string | null } | null;
            if (topic?.category) categories.add(topic.category);

            const agg = aggMap.get(d.id);
            const scoreA = d.player_a_id ? agg?.scores.get(d.player_a_id) ?? 0 : 0;
            const scoreB = d.player_b_id ? agg?.scores.get(d.player_b_id) ?? 0 : 0;

            rows.push({
                id: d.id,
                topicTitle: topic?.title ?? "Unknown topic",
                category: topic?.category ?? null,
                playerA: d.player_a_id ? nameMap.get(d.player_a_id) ?? null : null,
                playerB: d.player_b_id ? nameMap.get(d.player_b_id) ?? null : null,
                sideA: d.player_a_side ?? "FOR",
                scoreA,
                scoreB,
                winner: d.winner_id ? nameMap.get(d.winner_id) ?? null : null,
                argCount: agg?.count ?? 0,
                topFallacy: agg?.topFallacy ?? null,
                createdAt: d.created_at,
            });
        }
    }

    // Apply filter / sort.
    let visible = rows;
    if (filter === "discussed") {
        visible = [...rows].sort((a, b) => b.argCount - a.argCount);
    } else if (filter === "category" && activeCategory) {
        visible = rows.filter((r) => r.category === activeCategory);
    }

    const categoryList = Array.from(categories).sort();

    const buildHref = (f: Filter, category?: string) => {
        const sp = new URLSearchParams();
        sp.set("filter", f);
        if (f === "category" && category) sp.set("category", category);
        return `/debates?${sp.toString()}`;
    };

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={viewerUsername} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ The Archive
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Public <span style={{ color: "var(--text-gold)" }}>Debates</span>
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                        Completed arguments, judged by the Oracle. Read how they were won and lost.
                    </p>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {/* Filter tabs */}
                <div className="reveal-2" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
                    {FILTERS.map((f) => {
                        const isActive = filter === f.key;
                        return (
                            <Link
                                key={f.key}
                                href={buildHref(f.key, f.key === "category" ? activeCategory ?? undefined : undefined)}
                                className="feed-tab"
                                style={{
                                    fontFamily: "var(--font-cinzel), serif",
                                    fontSize: "0.62rem",
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                    padding: "0.5rem 1rem",
                                    borderRadius: "var(--radius-md)",
                                    border: `1px solid ${isActive ? "var(--gold-border-hover)" : "var(--border-default)"}`,
                                    background: isActive ? "var(--gold-glow)" : "transparent",
                                    color: isActive ? "var(--text-gold)" : "var(--text-secondary)",
                                }}
                            >
                                {f.label}
                            </Link>
                        );
                    })}
                </div>

                {/* Category chips (only in category mode) */}
                {filter === "category" && categoryList.length > 0 && (
                    <div className="reveal-2" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
                        {categoryList.map((cat) => {
                            const isActive = activeCategory === cat;
                            return (
                                <Link
                                    key={cat}
                                    href={buildHref("category", cat)}
                                    className="feed-chip"
                                    style={{
                                        fontFamily: "var(--font-share-tech), monospace",
                                        fontSize: "0.65rem",
                                        letterSpacing: "0.08em",
                                        textDecoration: "none",
                                        padding: "0.35rem 0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        border: `1px solid ${isActive ? "var(--teal-border)" : "var(--border-subtle)"}`,
                                        background: isActive ? "var(--teal-glow)" : "transparent",
                                        color: isActive ? "var(--text-teal)" : "var(--text-tertiary)",
                                    }}
                                >
                                    {cat}
                                </Link>
                            );
                        })}
                    </div>
                )}

                {/* Feed */}
                {visible.length === 0 ? (
                    <p className="reveal-3" style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "3rem 0" }}>
                        {filter === "category" && !activeCategory
                            ? "Choose a category above to read its debates."
                            : "No public debates yet. The first great argument is still being written."}
                    </p>
                ) : (
                    <div className="reveal-3" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                        {visible.map((r) => {
                            const aWon = r.winner !== null && r.winner === r.playerA;
                            const bWon = r.winner !== null && r.winner === r.playerB;
                            const sideB = r.sideA === "FOR" ? "AGAINST" : "FOR";
                            return (
                                <Link key={r.id} href={`/debate/${r.id}`} style={{ textDecoration: "none" }}>
                                    <article className="glass-card glass-card-gold feed-card" style={{ padding: "1.25rem 1.4rem" }}>
                                        {/* Top row: category + arg count */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                {r.category ?? "General"}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                                                {r.argCount} arg{r.argCount === 1 ? "" : "s"}
                                            </span>
                                        </div>

                                        {/* Topic */}
                                        <h2 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1.05rem", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.3, color: "var(--text-primary)", marginBottom: "0.85rem" }}>
                                            {r.topicTitle}
                                        </h2>

                                        {/* Players + scores */}
                                        <div className="score-tribune" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                            <span className={r.sideA === "FOR" ? "badge-for" : "badge-against"}>{r.sideA}</span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: aWon ? 700 : 500, color: aWon ? "var(--text-gold)" : "var(--text-secondary)" }}>
                                                {r.playerA ?? "Unknown"}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: "var(--text-primary)", letterSpacing: "0.06em", marginLeft: "auto" }}>
                                                {r.scoreA}
                                                <span style={{ color: "var(--text-tertiary)", margin: "0 0.4rem" }}>–</span>
                                                {r.scoreB}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: bWon ? 700 : 500, color: bWon ? "var(--text-gold)" : "var(--text-secondary)" }}>
                                                {r.playerB ?? "Unknown"}
                                            </span>
                                            <span className={sideB === "FOR" ? "badge-for" : "badge-against"}>{sideB}</span>
                                        </div>

                                        {/* Winner + top fallacy */}
                                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", letterSpacing: "0.1em", color: r.winner ? "var(--text-gold)" : "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                {r.winner ? `▸ Victor: ${r.winner}` : "▸ Draw"}
                                            </span>
                                            {r.topFallacy && (
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.06em", color: "var(--red-neon)", border: "1px solid var(--red-border)", background: "var(--red-glow)", borderRadius: "var(--radius-sm)", padding: "0.2rem 0.55rem" }}>
                                                    ⚠ {r.topFallacy}
                                                </span>
                                            )}
                                        </div>
                                    </article>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </main>

            <style>{`
        .feed-card {
          transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
        }
        .feed-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-card), var(--shadow-gold-sm);
        }
        .feed-tab:hover { color: var(--text-gold); border-color: var(--gold-border-hover); }
        .feed-chip:hover { color: var(--text-teal); border-color: var(--teal-border); }
      `}</style>
        </div>
    );
}
