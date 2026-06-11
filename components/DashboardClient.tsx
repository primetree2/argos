"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

/* ── Count-up hook ── */
function useCountUp(target: number, duration = 1200) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        const steps = 40;
        const inc = target / steps;
        const delay = duration / steps;
        let current = 0;
        const t = setInterval(() => {
            current += inc;
            if (current >= target) { setVal(target); clearInterval(t); }
            else setVal(Math.round(current));
        }, delay);
        return () => clearInterval(t);
    }, [target, duration]);
    return val;
}

interface DashboardClientProps {
    elo: number;
    won: number;
    lost: number;
    winRate: number;
    totalDebates: number;
    username: string;
}

export function DashboardClient({ elo, won, lost, winRate, totalDebates, username }: DashboardClientProps) {
    const eloDisplay = useCountUp(elo, 1400);
    const wonDisplay = useCountUp(won, 900);
    const lostDisplay = useCountUp(lost, 900);
    const rateDisplay = useCountUp(winRate, 1000);

    const rankLabel = elo >= 1400 ? "Rhetorical Master" : elo >= 1200 ? "Journeyman Orator" : "Novice Debater";

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground />
            <Navbar username={username} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>

                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2.75rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ Dashboard
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "0.2rem", lineHeight: 1.15 }}>
                        Welcome, <span style={{ color: "var(--text-gold)" }}>{username}</span>
                    </h1>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {/* Stat grid */}
                <div className="reveal-2 stat-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "1px", background: "var(--border-default)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "2.5rem" }}>

                    {/* ELO hero panel */}
                    <div className="scanlines stat-elo" style={{ background: "var(--bg-surface)", padding: "1.75rem 1.5rem", position: "relative", borderRight: "1px solid var(--border-default)" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-dim) 60%, transparent 100%)" }} />
                        <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.24em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                            Elo Rating
                        </p>
                        <p className="cursor-blink" style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "clamp(2rem, 5vw, 3rem)", color: "var(--gold)", lineHeight: 1, letterSpacing: "0.06em", textShadow: "0 0 20px rgba(201,168,76,0.35)" }}>
                            {eloDisplay}
                        </p>
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.8rem", fontStyle: "italic", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                            {rankLabel}
                        </p>
                    </div>

                    {/* Won */}
                    <StatPanel label="Won" value={wonDisplay} accent="var(--gold)" />
                    {/* Lost */}
                    <StatPanel label="Lost" value={lostDisplay} accent="var(--text-tertiary)" />
                    {/* Win Rate — liquid fill, always teal */}
                    <LiquidWinRate rate={winRate} animated={rateDisplay} />
                </div>

                {/* Win/loss bar */}
                {totalDebates > 0 && (
                    <div className="reveal-2" style={{ marginBottom: "2.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                Win / Loss record — {totalDebates} debate{totalDebates !== 1 ? "s" : ""}
                            </span>
                            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--text-secondary)", letterSpacing: "0.06em" }}>
                                {won}W · {lost}L
                            </span>
                        </div>
                        <div style={{ height: "3px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${winRate}%`, background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-bright) 100%)", borderRadius: "2px", transition: "width 1.2s ease", boxShadow: "0 0 8px rgba(201,168,76,0.4)" }} />
                        </div>
                    </div>
                )}

                {/* Certamen divider */}
                <div className="reveal-3" style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <div className="gold-rule-subtle" style={{ flex: 1 }} />
                    <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.60rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        Certamen
                    </span>
                    <div className="gold-rule-subtle" style={{ flex: 1 }} />
                </div>

                {/* Action cards */}
                <div className="reveal-4 action-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.875rem" }}>

                    {/* New Debate — breathing glow */}
                    <Link href="/debate/new" style={{ textDecoration: "none" }}>
                        <div className="glass-card action-card-primary new-debate-card" style={{ padding: "1.75rem 1.5rem", borderTop: "1px solid var(--gold)", cursor: "pointer", height: "100%" }}>
                            <ActionIcon color="var(--gold)">
                                <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
                            </ActionIcon>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.9rem", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                                New Debate
                            </p>
                            <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                Challenge someone to a ranked or casual match.
                            </p>
                        </div>
                    </Link>

                    <ComingSoonCard title="Browse Challenges" desc="Accept open challenges from other debaters." iconPath="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
                    <ComingSoonCard title="Debate vs AI" desc="Test your arguments against the Oracle itself." iconPath="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zM4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    <ComingSoonCard title="Leaderboard" desc="See where you stand among all orators." iconPath="M18 20V10M12 20V4M6 20v-6" />
                </div>
            </main>

            {/* Breathing glow CSS */}
            <style>{`
        @keyframes breathe-gold {
          0%, 100% { box-shadow: var(--shadow-card), 0 0 12px rgba(201,168,76,0.15); }
          50%       { box-shadow: var(--shadow-card), 0 0 28px rgba(201,168,76,0.38), 0 0 50px rgba(201,168,76,0.12); }
        }
        .new-debate-card {
          animation: breathe-gold 3.5s ease-in-out infinite;
        }
        .new-debate-card:hover {
          animation: none;
          transform: translateY(-2px);
          box-shadow: var(--shadow-card), var(--shadow-gold) !important;
        }
        [data-theme="light"] .new-debate-card {
          animation: none;
          box-shadow: var(--shadow-card), 0 0 18px rgba(122,82,16,0.18);
        }
      `}</style>
        </div>
    );
}

/* ── Liquid Win Rate panel ── */
function LiquidWinRate({ rate, animated }: { rate: number; animated: number }) {
    return (
        <div className="scanlines" style={{ background: "var(--bg-surface)", padding: "1.25rem 1rem", textAlign: "center", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100px" }}>
            {/* Teal top accent */}
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: "1px", background: "var(--teal)", opacity: 0.95, zIndex: 3 }} />
            {/* Rising liquid fill */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${animated}%`, background: "linear-gradient(180deg, rgba(0,255,224,0.38) 0%, rgba(0,255,224,0.18) 100%)", transition: "height 1.4s cubic-bezier(0.16,1,0.3,1)", zIndex: 1 }}>
                {/* Wave */}
                <div style={{ position: "absolute", top: "-7px", left: "-10%", width: "120%", height: "14px", background: "rgba(0,255,224,0.5)", borderRadius: "50%", animation: "wave-rock 3s ease-in-out infinite" }} />
            </div>
            {/* Text — above liquid */}
            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", letterSpacing: "0.22em", color: animated > 60 ? "rgba(0,0,0,0.7)" : "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.5rem", position: "relative", zIndex: 2, transition: "color 0.4s ease" }}>Win Rate</p>
            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.6rem", letterSpacing: "0.06em", lineHeight: 1, position: "relative", zIndex: 2, transition: "color 0.4s ease, text-shadow 0.4s ease", color: animated > 60 ? "var(--bg-void)" : "var(--teal)", textShadow: animated > 60 ? "0 1px 4px rgba(0,255,224,0.3)" : "0 0 12px rgba(0,255,224,0.5)" }}>
                {animated}%
            </p>
            <style>{`@keyframes wave-rock{0%,100%{transform:translateX(0) scaleX(1)}50%{transform:translateX(4%) scaleX(1.04)}}`}</style>
        </div>
    );
}

/* ── Sub-components ── */
function StatPanel({ label, value, accent, teal }: { label: string; value: string | number; accent: string; teal?: boolean }) {
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

function ActionIcon({ color, children }: { color: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: "0.85rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                {children}
            </svg>
        </div>
    );
}

function ComingSoonCard({ title, desc, iconPath }: { title: string; desc: string; iconPath: string }) {
    return (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "1.75rem 1.5rem", opacity: 0.55, cursor: "not-allowed", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", top: "0.9rem", right: "0.9rem", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.55rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: "2px", padding: "0.15rem 0.45rem", textTransform: "uppercase" }}>
                Soon
            </span>
            <ActionIcon color="var(--text-tertiary)">
                <path d={iconPath} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </ActionIcon>
            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.9rem", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-primary)", marginBottom: "0.4rem" }}>{title}</p>
            <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</p>
        </div>
    );
}