import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default async function DashboardPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("users")
        .select("elo_rating, debates_won, debates_lost, username")
        .eq("id", user.id)
        .single();

    const stats = {
        elo: profile?.elo_rating ?? 1200,
        won: profile?.debates_won ?? 0,
        lost: profile?.debates_lost ?? 0,
        username: profile?.username ?? user.email?.split("@")[0],
    };

    const totalDebates = stats.won + stats.lost;
    const winRate =
        totalDebates > 0 ? Math.round((stats.won / totalDebates) * 100) : 0;

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-void)",
                color: "var(--text-primary)",
            }}
        >
            <Navbar username={stats.username} />

            <main
                style={{
                    maxWidth: "820px",
                    margin: "0 auto",
                    padding: "3rem 1.5rem 4rem",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* ── Page header ── */}
                <div className="reveal-1" style={{ marginBottom: "2.75rem" }}>
                    <p
                        style={{
                            fontFamily: "var(--font-share-tech), monospace",
                            fontSize: "0.65rem",
                            letterSpacing: "0.28em",
                            color: "var(--text-gold)",
                            opacity: 0.85,
                            textTransform: "uppercase",
                            marginBottom: "0.6rem",
                        }}
                    >
                        ◆ Dashboard
                    </p>

                    <h1
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            color: "var(--text-primary)",
                            marginBottom: "0.2rem",
                            lineHeight: 1.15,
                        }}
                    >
                        Welcome,{" "}
                        <span style={{ color: "var(--text-gold)" }}>{stats.username}</span>
                    </h1>

                    {/* Gold underline rule */}
                    <div
                        style={{
                            marginTop: "0.85rem",
                            height: "1px",
                            width: "120px",
                            background:
                                "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)",
                        }}
                    />
                </div>

                {/* ── Stat instruments ── */}
                <div
                    className="reveal-2"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr 1fr",
                        gap: "1px",
                        background: "var(--border-default)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-lg)",
                        overflow: "hidden",
                        marginBottom: "2.5rem",
                    }}
                >
                    {/* ELO — hero panel */}
                    <div
                        className="scanlines"
                        style={{
                            background: "var(--bg-surface)",
                            padding: "1.75rem 1.5rem",
                            position: "relative",
                            borderRight: "1px solid var(--border-default)",
                        }}
                    >
                        {/* Top accent */}
                        <div
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                height: "2px",
                                background:
                                    "linear-gradient(90deg, var(--gold) 0%, var(--gold-dim) 60%, transparent 100%)",
                            }}
                        />
                        <p
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.58rem",
                                letterSpacing: "0.24em",
                                color: "var(--text-gold)",
                                opacity: 0.9,
                                textTransform: "uppercase",
                                marginBottom: "0.6rem",
                            }}
                        >
                            Elo Rating
                        </p>
                        <p
                            className="cursor-blink"
                            style={{
                                fontFamily: "var(--font-share-tech), monospace",
                                fontSize: "clamp(2rem, 5vw, 3rem)",
                                color: "var(--gold)",
                                lineHeight: 1,
                                letterSpacing: "0.06em",
                                textShadow: "0 0 20px rgba(201,168,76,0.35)",
                            }}
                        >
                            {stats.elo}
                        </p>
                        <p
                            style={{
                                fontFamily: "var(--font-crimson), serif",
                                fontSize: "0.8rem",
                                fontStyle: "italic",
                                color: "var(--text-tertiary)",
                                marginTop: "0.5rem",
                            }}
                        >
                            {stats.elo >= 1400
                                ? "Rhetorical Master"
                                : stats.elo >= 1200
                                    ? "Journeyman Orator"
                                    : "Novice Debater"}
                        </p>
                    </div>

                    {/* Won */}
                    <StatPanel label="Won" value={stats.won} accent="var(--gold)" />
                    {/* Lost */}
                    <StatPanel label="Lost" value={stats.lost} accent="var(--text-tertiary)" />
                    {/* Win rate */}
                    <StatPanel
                        label="Win Rate"
                        value={`${winRate}%`}
                        accent={winRate >= 50 ? "var(--teal)" : "var(--text-secondary)"}
                        teal={winRate >= 50}
                    />
                </div>

                {/* ── Win rate progress bar ── */}
                {totalDebates > 0 && (
                    <div
                        className="reveal-2"
                        style={{ marginBottom: "2.5rem" }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.5rem",
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: "var(--font-cinzel), serif",
                                    fontSize: "0.58rem",
                                    letterSpacing: "0.18em",
                                    color: "var(--text-tertiary)",
                                    textTransform: "uppercase",
                                }}
                            >
                                Win / Loss record — {totalDebates} debate{totalDebates !== 1 ? "s" : ""}
                            </span>
                            <span
                                style={{
                                    fontFamily: "var(--font-share-tech), monospace",
                                    fontSize: "0.72rem",
                                    color: "var(--text-secondary)",
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {stats.won}W · {stats.lost}L
                            </span>
                        </div>
                        <div
                            style={{
                                height: "3px",
                                background: "var(--bg-elevated)",
                                borderRadius: "2px",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${winRate}%`,
                                    background:
                                        "linear-gradient(90deg, var(--gold) 0%, var(--gold-bright) 100%)",
                                    borderRadius: "2px",
                                    transition: "width 1s ease",
                                    boxShadow: "0 0 8px rgba(201,168,76,0.4)",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* ── Certamen section heading ── */}
                <div
                    className="reveal-3"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        marginBottom: "1.25rem",
                    }}
                >
                    <div className="gold-rule-subtle" style={{ flex: 1 }} />
                    <span
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "0.60rem",
                            letterSpacing: "0.28em",
                            color: "var(--text-gold)",
                            opacity: 0.85,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Certamen
                    </span>
                    <div className="gold-rule-subtle" style={{ flex: 1 }} />
                </div>

                {/* ── Action cards ── */}
                <div
                    className="reveal-4"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "0.875rem",
                    }}
                >
                    {/* New Debate — primary */}
                    <Link
                        href="/debate/new"
                        style={{ textDecoration: "none" }}
                    >
                        <div
                            className="glass-card action-card-primary"
                            style={{
                                padding: "1.75rem 1.5rem",
                                borderTop: "1px solid var(--gold)",
                                cursor: "pointer",
                                height: "100%",
                            }}
                        >
                            <ActionIcon color="var(--gold)">
                                <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
                            </ActionIcon>
                            <p
                                style={{
                                    fontFamily: "var(--font-cinzel), serif",
                                    fontSize: "0.9rem",
                                    fontWeight: 600,
                                    letterSpacing: "0.06em",
                                    color: "var(--text-primary)",
                                    marginBottom: "0.4rem",
                                }}
                            >
                                New Debate
                            </p>
                            <p
                                style={{
                                    fontFamily: "var(--font-crimson), serif",
                                    fontSize: "0.88rem",
                                    fontStyle: "italic",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.5,
                                }}
                            >
                                Challenge someone to a ranked or casual match.
                            </p>
                        </div>
                    </Link>

                    {/* Browse Challenges — coming soon */}
                    <ComingSoonCard
                        title="Browse Challenges"
                        desc="Accept open challenges from other debaters."
                        iconPath="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"
                    />

                    {/* Debate vs AI — coming soon */}
                    <ComingSoonCard
                        title="Debate vs AI"
                        desc="Test your arguments against the Oracle itself."
                        iconPath="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zM4 20c0-4 3.6-7 8-7s8 3 8 7"
                    />

                    {/* Leaderboard — coming soon */}
                    <ComingSoonCard
                        title="Leaderboard"
                        desc="See where you stand among all orators."
                        iconPath="M18 20V10M12 20V4M6 20v-6"
                    />
                </div>
            </main>
        </div>
    );
}

/* ── Stat panel sub-component ── */
function StatPanel({
    label,
    value,
    accent,
    teal,
}: {
    label: string;
    value: string | number;
    accent: string;
    teal?: boolean;
}) {
    return (
        <div
            className="scanlines"
            style={{
                background: "var(--bg-surface)",
                padding: "1.25rem 1rem",
                textAlign: "center",
                position: "relative",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: "20%",
                    right: "20%",
                    height: "1px",
                    background: accent,
                    opacity: 0.75,
                }}
            />
            <p
                style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.55rem",
                    letterSpacing: "0.22em",
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                }}
            >
                {label}
            </p>
            <p
                style={{
                    fontFamily: "var(--font-share-tech), monospace",
                    fontSize: "1.6rem",
                    color: accent,
                    letterSpacing: "0.06em",
                    lineHeight: 1,
                    textShadow: teal
                        ? "0 0 12px rgba(0,255,224,0.25)"
                        : undefined,
                }}
            >
                {value}
            </p>
        </div>
    );
}

/* ── Action icon helper ── */
function ActionIcon({
    color,
    children,
}: {
    color: string;
    children: React.ReactNode;
}) {
    return (
        <div style={{ marginBottom: "0.85rem" }}>
            <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.75 }}
            >
                {children}
            </svg>
        </div>
    );
}

/* ── Coming Soon card ── */
function ComingSoonCard({
    title,
    desc,
    iconPath,
}: {
    title: string;
    desc: string;
    iconPath: string;
}) {
    return (
        <div
            style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: "1.75rem 1.5rem",
                opacity: 0.55,
                cursor: "not-allowed",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* "Soon" badge */}
            <span
                style={{
                    position: "absolute",
                    top: "0.9rem",
                    right: "0.9rem",
                    fontFamily: "var(--font-share-tech), monospace",
                    fontSize: "0.55rem",
                    letterSpacing: "0.18em",
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "2px",
                    padding: "0.15rem 0.45rem",
                    textTransform: "uppercase",
                }}
            >
                Soon
            </span>

            <ActionIcon color="var(--text-tertiary)">
                <path d={iconPath} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </ActionIcon>

            <p
                style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: "var(--text-primary)",
                    marginBottom: "0.4rem",
                }}
            >
                {title}
            </p>
            <p
                style={{
                    fontFamily: "var(--font-crimson), serif",
                    fontSize: "0.88rem",
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                }}
            >
                {desc}
            </p>
        </div>
    );
}