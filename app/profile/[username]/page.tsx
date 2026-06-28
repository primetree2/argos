import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { fetchDebateHistory, type DebateHistoryEntry } from "@/lib/debates";
import { BlockButton } from "@/components/safety/BlockButton";
import { Achievements } from "@/components/profile/Achievements";
import { MindArchetype } from "@/components/profile/MindArchetype";
import { getTitle } from "@/lib/achievements";
import { aggregateArchetype } from "@/lib/ai/archetype";

// Oracle system user (migration 0006) — never offer to block the AI.
const ORACLE_USER_ID = "00000000-0000-0000-0000-0000000000a1";

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

export async function generateMetadata({
    params,
}: {
    params: Promise<{ username: string }>;
}) {
    const { username } = await params;
    return { title: `${decodeURIComponent(username)} — Argos` };
}

/** Map a series of Elo values to SVG polyline coordinates. */
function sparkline(values: number[], w: number, h: number, pad: number) {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });
    return {
        points: coords.map((c) => `${c.x},${c.y}`).join(" "),
        last: coords[coords.length - 1],
        min,
        max,
    };
}

export default async function ProfilePage({
    params,
}: {
    params: Promise<{ username: string }>;
}) {
    const { username } = await params;
    const decoded = decodeURIComponent(username);
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
        .from("users")
        .select("id, username, elo_rating, debates_won, debates_lost, created_at")
        .eq("username", decoded)
        .single();

    if (!profile) notFound();

    let viewerUsername: string | null = null;
    let viewerBlocksProfile = false;
    if (user) {
        if (user.id === profile.id) {
            viewerUsername = profile.username;
        } else {
            const [{ data: me }, { data: block }] = await Promise.all([
                supabase.from("users").select("username").eq("id", user.id).single(),
                supabase
                    .from("user_blocks")
                    .select("id")
                    .eq("blocker_id", user.id)
                    .eq("blocked_id", profile.id)
                    .maybeSingle(),
            ]);
            viewerUsername = me?.username ?? null;
            viewerBlocksProfile = !!block;
        }
    }

    // Show the block control only to a signed-in viewer looking at someone
    // else's (non-Oracle) profile.
    const canBlock =
        !!user && user.id !== profile.id && profile.id !== ORACLE_USER_ID;

    const [{ data: eloRows }, history, { data: scoredArgs }] = await Promise.all([
        supabase
            .from("elo_history")
            .select("elo_before, elo_after, created_at")
            .eq("user_id", profile.id)
            .order("created_at", { ascending: true })
            .limit(60),
        fetchDebateHistory(supabase, profile.id, 5),
        // Scored arguments by this user — used to derive fallacy-free badges.
        // Capped; badges only need thresholds (10 / 20+), not an exact lifetime
        // count, so this stays a cheap bounded read.
        supabase
            .from("arguments")
            .select("fallacies_found, score_clarity, score_evidence, score_logic, score_rebuttal, fallacy_penalty")
            .eq("user_id", profile.id)
            .eq("scoring_status", "done")
            .limit(500),
    ]);

    const elo = profile.elo_rating ?? 1200;
    const won = profile.debates_won ?? 0;
    const lost = profile.debates_lost ?? 0;
    const total = won + lost;
    const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
    const memberSince = profile.created_at ? DATE_FMT.format(new Date(profile.created_at)) : null;
    const rankLabel = getTitle(elo).label;

    // Count scored + fallacy-free arguments for the achievement badges. A
    // fallacy-free argument has an empty fallacies_found array.
    const scoredArguments = scoredArgs?.length ?? 0;
    const fallacyFreeArguments =
        scoredArgs?.filter((a) => {
            const f = a.fallacies_found as unknown;
            return Array.isArray(f) ? f.length === 0 : true;
        }).length ?? 0;

    // Mind archetype (ROADMAP §2.5 force 3): a pure aggregate over the same
    // scored-arguments read. Null below the reveal threshold (~5 arguments).
    const ARCHETYPE_MIN_SAMPLE = 5;
    const archetype = aggregateArchetype(scoredArgs ?? [], ARCHETYPE_MIN_SAMPLE);
    const isOwnProfile = !!user && user.id === profile.id;

    const eloSeries =
        eloRows && eloRows.length > 0
            ? [eloRows[0].elo_before ?? 1200, ...eloRows.map((r) => r.elo_after ?? 1200)]
            : [];
    const W = 560;
    const H = 120;
    const chart = sparkline(eloSeries, W, H, 10);

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar username={viewerUsername} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2.5rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ Orator Profile
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        <span style={{ color: "var(--text-gold)" }}>{profile.username}</span>
                    </h1>
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.9rem", fontStyle: "italic", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                        {rankLabel}
                        {memberSince && <> · In the arena since {memberSince}</>}
                    </p>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                    {canBlock && (
                        <div style={{ marginTop: "1.1rem" }}>
                            <BlockButton targetUserId={profile.id} initialBlocked={viewerBlocksProfile} />
                        </div>
                    )}
                </div>

                {/* Stat grid */}
                <div className="reveal-2 stat-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "1px", background: "var(--border-default)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "2.5rem" }}>
                    <div className="scanlines stat-elo" style={{ background: "var(--bg-surface)", padding: "1.75rem 1.5rem", position: "relative", borderRight: "1px solid var(--border-default)" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-dim) 60%, transparent 100%)" }} />
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.24em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                            Elo Rating
                        </p>
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "clamp(2rem, 5vw, 3rem)", color: "var(--gold)", lineHeight: 1, letterSpacing: "0.06em", textShadow: "0 0 20px rgba(201,168,76,0.35)" }}>
                            {elo}
                        </p>
                    </div>
                    <ProfileStat label="Won" value={won} accent="var(--gold)" />
                    <ProfileStat label="Lost" value={lost} accent="var(--text-tertiary)" />
                    <ProfileStat label="Win Rate" value={`${winRate}%`} accent="var(--teal)" teal />
                </div>

                {/* Mind archetype — the identity payload (§2.5 force 3) */}
                <div className="reveal-3" style={{ marginBottom: "2.5rem" }}>
                    <MindArchetype
                        archetype={archetype}
                        scoredCount={scoredArguments}
                        minSample={ARCHETYPE_MIN_SAMPLE}
                        isOwnProfile={isOwnProfile}
                    />
                </div>

                {/* Elo history sparkline */}
                <div className="reveal-4" style={{ marginBottom: "2.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                        <div className="gold-rule-subtle" style={{ flex: 1 }} />
                        <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.60rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            Rating Trajectory
                        </span>
                        <div className="gold-rule-subtle" style={{ flex: 1 }} />
                    </div>

                    <div className="glass-card scanlines" style={{ padding: "1.25rem 1.5rem" }}>
                        {chart ? (
                            <>
                                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="120" preserveAspectRatio="none" role="img" aria-label="Elo rating history chart">
                                    <polyline points={chart.points} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                    <circle cx={chart.last.x} cy={chart.last.y} r="3" fill="var(--gold)" />
                                </svg>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                                        LOW {chart.min}
                                    </span>
                                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                                        HIGH {chart.max}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "1.5rem 0" }}>
                                Not enough rated debates yet to chart a trajectory.
                            </p>
                        )}
                    </div>
                </div>

                {/* Achievements */}
                <div className="reveal-5" style={{ marginBottom: "2.5rem" }}>
                    <Achievements
                        input={{
                            elo,
                            wins: won,
                            losses: lost,
                            scoredArguments,
                            fallacyFreeArguments,
                        }}
                    />
                </div>

                {/* Recent debates */}
                <div className="reveal-6">
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                        <div className="gold-rule-subtle" style={{ flex: 1 }} />
                        <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.60rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            Recent Trials
                        </span>
                        <div className="gold-rule-subtle" style={{ flex: 1 }} />
                    </div>

                    {history.length === 0 ? (
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "1.5rem 0" }}>
                            No debates recorded yet.
                        </p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {history.map((h) => (
                                <Link key={h.id} href={`/debate/${h.id}`} style={{ textDecoration: "none" }}>
                                    <div className="profile-history-row" style={{ display: "flex", alignItems: "center", gap: "0.85rem", padding: "0.8rem 1.1rem", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
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
                </div>
            </main>

            <style>{`
        .profile-history-row {
          transition: border-color 200ms ease, background 200ms ease, transform 200ms ease;
        }
        .profile-history-row:hover {
          border-color: var(--gold-border-hover);
          background: var(--gold-glow);
          transform: translateX(4px);
        }
      `}</style>
        </div>
    );
}

function ProfileStat({ label, value, accent, teal }: { label: string; value: string | number; accent: string; teal?: boolean }) {
    return (
        <div className="scanlines" style={{ background: "var(--bg-surface)", padding: "1.25rem 1rem", textAlign: "center", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: accent, opacity: 0.95 }} />
            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                {label}
            </p>
            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.6rem", color: accent, letterSpacing: "0.06em", lineHeight: 1, textShadow: teal ? "0 0 12px rgba(0,255,224,0.25)" : undefined }}>
                {value}
            </p>
        </div>
    );
}
