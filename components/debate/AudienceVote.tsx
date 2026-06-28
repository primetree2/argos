"use client";

import { useState, useEffect, useCallback } from "react";

// Audience voting widget (ROADMAP Phase 3, item 2). Shown to spectators only.
// Lets the crowd vote, per round, for the side they think is winning, and shows
// a live split "Crowd 73% / 27%". Posts to /api/votes (toggle/switch). Player A
// is rendered as gold, Player B as teal, matching the debate score columns.

interface Tally { player_a: number; player_b: number }

export function AudienceVote({
    debateId,
    round,
    playerALabel,
    playerBLabel,
    canVote = true,
}: {
    debateId: string;
    round: number;
    playerALabel: string;
    playerBLabel: string;
    // When false (anonymous/logged-out viewer), the live tally still shows but
    // the vote controls are replaced with a sign-in hint — /api/votes requires
    // auth, so we never let a logged-out viewer fire a request that 401s.
    canVote?: boolean;
}) {
    const [tally, setTally] = useState<Tally>({ player_a: 0, player_b: 0 });
    const [mine, setMine] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/votes?debateId=${debateId}`);
            const data = await res.json();
            const t = (data.tallies?.[round] as Tally) ?? { player_a: 0, player_b: 0 };
            setTally(t);
            setMine((data.mine?.[round] as string) ?? null);
        } catch {
            /* non-critical */
        }
    }, [debateId, round]);

    useEffect(() => {
        load();
    }, [load]);

    const vote = useCallback(
        async (side: "player_a" | "player_b") => {
            if (pending) return;
            setPending(true);
            // Optimistic.
            const prevTally = tally;
            const prevMine = mine;
            const next: Tally = { ...tally };
            if (mine === side) {
                next[side] = Math.max(0, next[side] - 1);
                setMine(null);
            } else {
                if (mine === "player_a" || mine === "player_b") {
                    next[mine] = Math.max(0, next[mine] - 1);
                }
                next[side] += 1;
                setMine(side);
            }
            setTally(next);

            try {
                const res = await fetch("/api/votes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ debateId, round, side }),
                });
                if (!res.ok) throw new Error("failed");
                // Reconcile with the authoritative tally.
                load();
            } catch {
                setTally(prevTally);
                setMine(prevMine);
            } finally {
                setPending(false);
            }
        },
        [debateId, round, tally, mine, pending, load]
    );

    const total = tally.player_a + tally.player_b;
    const pctA = total > 0 ? Math.round((tally.player_a / total) * 100) : 50;
    const pctB = 100 - pctA;

    const chip = (side: "player_a" | "player_b", label: string, color: string) => {
        const active = mine === side;
        return (
            <button
                onClick={() => vote(side)}
                disabled={pending}
                aria-pressed={active}
                style={{
                    flex: 1,
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.62rem",
                    letterSpacing: "0.08em",
                    padding: "0.5rem 0.6rem",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${active ? color : "var(--border-default)"}`,
                    background: active ? "var(--gold-glow)" : "transparent",
                    color: active ? color : "var(--text-secondary)",
                    cursor: pending ? "default" : "pointer",
                    transition: "all 150ms ease",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {active ? "✓ " : ""}{label}
            </button>
        );
    };

    return (
        <div className="glass-card" style={{ padding: "0.9rem 1.1rem", marginTop: "0.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.18em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                    ◆ Crowd · Round {round}
                </span>
                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                    {total} {total === 1 ? "vote" : "votes"}
                </span>
            </div>

            {/* Split bar */}
            <div style={{ display: "flex", height: "6px", borderRadius: "3px", overflow: "hidden", background: "var(--bg-elevated)", marginBottom: "0.6rem" }}>
                <div style={{ width: `${pctA}%`, background: "var(--gold)", transition: "width 400ms ease" }} />
                <div style={{ width: `${pctB}%`, background: "var(--teal)", transition: "width 400ms ease" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", marginBottom: "0.6rem" }}>
                <span style={{ color: "var(--gold)" }}>{pctA}%</span>
                <span style={{ color: "var(--teal)" }}>{pctB}%</span>
            </div>

            {canVote ? (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    {chip("player_a", playerALabel, "var(--gold)")}
                    {chip("player_b", playerBLabel, "var(--teal)")}
                </div>
            ) : (
                <a
                    href="/login"
                    style={{ display: "block", textAlign: "center", fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-gold)", textDecoration: "none", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-sm)", padding: "0.5rem" }}
                >
                    Sign in to vote
                </a>
            )}
        </div>
    );
}
