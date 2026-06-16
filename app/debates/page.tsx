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

const FILTERS: { key: Filter; label: string }[] = [
    { key: "recent", label: "Recent" },
    { key: "discussed", label: "Most Discussed" },
    { key: "category", label: "By Category" },
];

// One row of the precomputed public_debate_feed view.
interface FeedRow {
    id: string;
    created_at: string | null;
    side_a: string;
    topic_title: string;
    category: string | null;
    player_a: string | null;
    player_b: string | null;
    winner: string | null;
    score_a: number;
    score_b: number;
    arg_count: number;
    top_fallacy: string | null;
}

export default async function PublicDebatesPage({
    searchParams,
}: {
    searchParams: Promise<{ filter?: string; category?: string; page?: string }>;
}) {
    const params = await searchParams;
    const filter: Filter =
        params.filter === "discussed" || params.filter === "category"
            ? params.filter
            : "recent";
    const activeCategory = params.category ?? null;

    const PAGE_SIZE = 30;
    const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

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

    // Single authoritative query against the precomputed view. Filtering,
    // sorting and pagination all happen in SQL, so 'Most Discussed' and
    // 'By Category' are accurate across the WHOLE dataset (not just the page).
    let query = supabase
        .from("public_debate_feed")
        .select("*", { count: "exact" });

    if (filter === "category" && activeCategory) {
        query = query.eq("category", activeCategory);
    }

    if (filter === "discussed") {
        query = query
            .order("arg_count", { ascending: false })
            .order("created_at", { ascending: false });
    } else {
        query = query.order("created_at", { ascending: false });
    }

    const { data: feedRows, count } = await query.range(from, to);
    const visible: FeedRow[] = (feedRows as FeedRow[] | null) ?? [];

    const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    // Category chips: a lightweight distinct-category pull for the picker.
    let categoryList: string[] = [];
    if (filter === "category") {
        const { data: cats } = await supabase
            .from("public_debate_feed")
            .select("category")
            .not("category", "is", null)
            .limit(500);
        categoryList = Array.from(
            new Set((cats ?? []).map((c: { category: string | null }) => c.category).filter(Boolean) as string[])
        ).sort();
    }

    const buildHref = (f: Filter, category?: string) => {
        const sp = new URLSearchParams();
        sp.set("filter", f);
        if (f === "category" && category) sp.set("category", category);
        return `/debates?${sp.toString()}`;
    };

    const buildPageHref = (p: number) => {
        const params2 = new URLSearchParams();
        params2.set("filter", filter);
        if (filter === "category" && activeCategory) params2.set("category", activeCategory);
        params2.set("page", String(p));
        return `/debates?${params2.toString()}`;
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
                            const aWon = r.winner !== null && r.winner === r.player_a;
                            const bWon = r.winner !== null && r.winner === r.player_b;
                            const sideB = r.side_a === "FOR" ? "AGAINST" : "FOR";
                            return (
                                <Link key={r.id} href={`/debate/${r.id}`} style={{ textDecoration: "none" }}>
                                    <article className="glass-card glass-card-gold feed-card" style={{ padding: "1.25rem 1.4rem" }}>
                                        {/* Top row: category + arg count */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                {r.category ?? "General"}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                                                {r.arg_count} arg{r.arg_count === 1 ? "" : "s"}
                                            </span>
                                        </div>

                                        {/* Topic */}
                                        <h2 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1.05rem", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.3, color: "var(--text-primary)", marginBottom: "0.85rem" }}>
                                            {r.topic_title}
                                        </h2>

                                        {/* Players + scores */}
                                        <div className="score-tribune" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                            <span className={r.side_a === "FOR" ? "badge-for" : "badge-against"}>{r.side_a}</span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: aWon ? 700 : 500, color: aWon ? "var(--text-gold)" : "var(--text-secondary)" }}>
                                                {r.player_a ?? "Unknown"}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.95rem", color: "var(--text-primary)", letterSpacing: "0.06em", marginLeft: "auto" }}>
                                                {r.score_a}
                                                <span style={{ color: "var(--text-tertiary)", margin: "0 0.4rem" }}>–</span>
                                                {r.score_b}
                                            </span>
                                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.85rem", fontWeight: bWon ? 700 : 500, color: bWon ? "var(--text-gold)" : "var(--text-secondary)" }}>
                                                {r.player_b ?? "Unknown"}
                                            </span>
                                            <span className={sideB === "FOR" ? "badge-for" : "badge-against"}>{sideB}</span>
                                        </div>

                                        {/* Winner + top fallacy */}
                                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", letterSpacing: "0.1em", color: r.winner ? "var(--text-gold)" : "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                {r.winner ? `▸ Victor: ${r.winner}` : "▸ Draw"}
                                            </span>
                                            {r.top_fallacy && (
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.06em", color: "var(--red-neon)", border: "1px solid var(--red-border)", background: "var(--red-glow)", borderRadius: "var(--radius-sm)", padding: "0.2rem 0.55rem" }}>
                                                    ⚠ {r.top_fallacy}
                                                </span>
                                            )}
                                        </div>
                                    </article>
                                </Link>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="reveal-3" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "2rem" }}>
                        {hasPrev ? (
                            <Link href={buildPageHref(page - 1)} className="btn-ghost" style={{ textDecoration: "none" }}>
                                ← Prev
                            </Link>
                        ) : (
                            <span className="btn-ghost" style={{ opacity: 0.35, pointerEvents: "none" }}>← Prev</span>
                        )}
                        <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.7rem", letterSpacing: "0.12em", color: "var(--text-tertiary)" }}>
                            {page} / {totalPages}
                        </span>
                        {hasNext ? (
                            <Link href={buildPageHref(page + 1)} className="btn-ghost" style={{ textDecoration: "none" }}>
                                Next →
                            </Link>
                        ) : (
                            <span className="btn-ghost" style={{ opacity: 0.35, pointerEvents: "none" }}>Next →</span>
                        )}
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