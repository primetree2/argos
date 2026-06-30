import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { fetchDebateHistory, type DebateHistoryEntry } from "@/lib/debates";

export const metadata = {
    title: "Chronicle — Argos",
    description: "Your full debate history.",
};

export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

const RESULT_STYLES: Record<DebateHistoryEntry["result"], { label: string; color: string }> = {
    won: { label: "Won", color: "var(--gold)" },
    lost: { label: "Lost", color: "var(--text-tertiary)" },
    draw: { label: "Draw", color: "var(--text-secondary)" },
    active: { label: "Active", color: "var(--teal)" },
};

export default async function ChroniclePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("users")
        .select("username")
        .eq("id", user.id)
        .single();

    // A generous window of recent debates (the dashboard now shows none; this is
    // the home for full history). Bounded to keep the read cheap.
    const history = await fetchDebateHistory(supabase, user.id, 100);

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar username={profile?.username ?? null} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ The Chronicle
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Your <span style={{ color: "var(--text-gold)" }}>History</span>
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                        Every trial you have faced, most recent first.
                    </p>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {history.length === 0 ? (
                    <div
                        className="reveal-2 glass-card"
                        style={{ textAlign: "center", padding: "2.5rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}
                    >
                        <svg width="40" height="40" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ marginBottom: "0.5rem", filter: "drop-shadow(0 0 8px rgba(201,168,76,0.25))" }}>
                            <polygon points="14,2 26,24 2,24" fill="none" stroke="var(--gold)" strokeWidth="1.25" strokeLinejoin="round" />
                            <polygon points="14,8 21,21 7,21" fill="var(--gold-glow)" stroke="var(--gold-dim)" strokeWidth="0.75" strokeLinejoin="round" />
                            <circle cx="14" cy="15" r="1.5" fill="var(--gold)" />
                        </svg>
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.65rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                            Your Chronicle Awaits
                        </p>
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, maxWidth: "34ch" }}>
                            No debates recorded yet. Every legend begins with a first trial.
                        </p>
                        <Link href="/debate/new" className="btn-oracle" style={{ marginTop: "0.85rem", textDecoration: "none" }}>
                            Begin Your First Debate →
                        </Link>
                    </div>
                ) : (
                    <div className="reveal-2" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {history.map((h) => (
                            <Link key={h.id} href={`/debate/${h.id}`} style={{ textDecoration: "none" }}>
                                <div className="chronicle-row" style={{ display: "flex", alignItems: "center", gap: "0.85rem", padding: "0.8rem 1.1rem", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
                                    <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", padding: "0.2rem 0.55rem", borderRadius: "2px", flexShrink: 0, color: RESULT_STYLES[h.result].color, border: `1px solid ${RESULT_STYLES[h.result].color}`, opacity: 0.9 }}>
                                        {RESULT_STYLES[h.result].label}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.95rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {h.topic}
                                        </p>
                                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.68rem", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                                            vs {h.opponent ?? "—"}
                                        </p>
                                    </div>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.68rem", color: "var(--text-tertiary)", letterSpacing: "0.06em", flexShrink: 0 }}>
                                        {h.createdAt ? DATE_FMT.format(new Date(h.createdAt)) : ""}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>

            <style>{`
        .chronicle-row {
          transition: border-color 200ms ease, background 200ms ease, transform 200ms ease;
        }
        .chronicle-row:hover {
          border-color: var(--gold-border-hover);
          background: var(--gold-glow);
          transform: translateX(4px);
        }
      `}</style>
        </div>
    );
}
