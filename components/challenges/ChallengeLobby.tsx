"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OpenChallenge } from "@/app/challenges/page";

const CATEGORIES = ["Politics", "Science", "Philosophy", "Technology", "Culture"];

export function ChallengeLobby({ challenges: initial, currentUserId }: {
    challenges: OpenChallenge[];
    currentUserId: string;
}) {
    const router = useRouter();
    const supabase = createClient();

    const [topic, setTopic] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState("");

    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
    const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
    const [refreshing, setRefreshing] = useState(false);

    const removeCard = (id: string) =>
        setRemovedIds((prev) => new Set(prev).add(id));

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 800);
    }, [router]);

    // Realtime — listen for challenge status changes
    useEffect(() => {
        const myChallenge = initial.find((c) => c.isMine);

        const channel = supabase
            .channel("challenges-lobby")
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "challenges" },
                (payload) => {
                    const updated = payload.new as {
                        id: string;
                        status: string;
                        creator_id: string;
                        debate_id: string | null;
                    };

                    // If THIS user's challenge just got accepted → redirect them to the debate
                    if (
                        updated.creator_id === currentUserId &&
                        updated.status === "accepted" &&
                        updated.debate_id
                    ) {
                        router.push(`/debate/${updated.debate_id}`);
                        return;
                    }

                    // Any other change → refresh the list silently
                    router.refresh();
                }
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "challenges" },
                () => { router.refresh(); }
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "challenges" },
                () => { router.refresh(); }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [router, supabase, currentUserId, initial]);

    const handlePost = async () => {
        if (!topic.trim()) { setPostError("Enter a topic to post a challenge."); return; }
        setPosting(true);
        setPostError("");
        try {
            const res = await fetch("/api/challenges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, category }),
            });
            const data = await res.json();
            if (!res.ok) { setPostError(data.error ?? "Something went wrong."); setPosting(false); return; }
            setTopic("");
            setCategory(null);
            setPosting(false);
            router.refresh();
        } catch {
            setPostError("The Oracle is unreachable. Try again.");
            setPosting(false);
        }
    };

    const handleAccept = async (id: string) => {
        setAcceptingId(id);
        setCardErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
        try {
            const res = await fetch(`/api/challenges/${id}/accept`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                removeCard(id);
                setCardErrors((prev) => ({
                    ...prev,
                    [id]: data.error ?? "This challenge was just accepted by someone else.",
                }));
                setAcceptingId(null);
                router.refresh();
                return;
            }
            router.push(`/debate/${data.debateId}`);
        } catch {
            setCardErrors((prev) => ({ ...prev, [id]: "The Oracle is unreachable. Try again." }));
            setAcceptingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/challenges?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                setCardErrors((prev) => ({ ...prev, [id]: data.error ?? "Could not withdraw challenge." }));
                setDeletingId(null);
                return;
            }
            removeCard(id);
            setDeletingId(null);
            router.refresh();
        } catch {
            setCardErrors((prev) => ({ ...prev, [id]: "The Oracle is unreachable. Try again." }));
            setDeletingId(null);
        }
    };

    const wordCount = topic.trim() ? topic.trim().split(/\s+/).length : 0;
    const visibleChallenges = initial.filter((c) => !removedIds.has(c.id));

    return (
        <>
            {/* Header */}
            <div className="reveal-1" style={{ marginBottom: "2rem" }}>
                <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                    ◆ The Lobby
                </p>
                <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                    Open <span style={{ color: "var(--text-gold)" }}>Challenges</span>
                </h1>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", marginTop: "0.6rem" }}>
                    Post a motion to the arena, or accept one. No invite required.
                </p>
                <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
            </div>

            {/* Post a challenge */}
            <div className="reveal-2 glass-card glass-card-gold" style={{ padding: "1.5rem", marginBottom: "2.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                    <label style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                        Post a Challenge
                    </label>
                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                        {wordCount} {wordCount === 1 ? "word" : "words"}
                    </span>
                </div>

                <textarea
                    value={topic}
                    onChange={(e) => { setTopic(e.target.value); if (postError) setPostError(""); }}
                    placeholder="State the motion you want to defend…"
                    rows={2}
                    className="oracle-input"
                    style={{ resize: "none" }}
                />

                <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {CATEGORIES.map((cat) => {
                        const active = category === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setCategory(active ? null : cat)}
                                style={{
                                    fontFamily: "var(--font-share-tech), monospace",
                                    fontSize: "0.65rem",
                                    letterSpacing: "0.08em",
                                    padding: "0.35rem 0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    border: `1px solid ${active ? "var(--teal-border)" : "var(--border-default)"}`,
                                    background: active ? "var(--teal-glow)" : "var(--bg-surface)",
                                    color: active ? "var(--text-teal)" : "var(--text-tertiary)",
                                    cursor: "pointer",
                                    transition: "all 150ms ease",
                                }}
                            >
                                {cat}
                            </button>
                        );
                    })}
                </div>

                {postError && (
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", color: "var(--red-neon)", letterSpacing: "0.06em", marginTop: "0.85rem", padding: "0.6rem 0.85rem", background: "var(--red-glow)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)" }}>
                        ⚠ {postError}
                    </p>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button onClick={handlePost} disabled={posting} className="btn-oracle" style={{ fontSize: "0.7rem", letterSpacing: "0.18em", padding: "0.7rem 1.5rem" }}>
                        {posting ? <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;Posting…</> : "Post to Lobby →"}
                    </button>
                </div>
            </div>

            {/* Awaiting header + refresh */}
            <div className="reveal-3" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase" }}>
                    Awaiting an Opponent
                </p>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh challenges"
                    style={{
                        display: "flex", alignItems: "center", gap: "0.35rem",
                        background: "transparent", border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-sm)", color: "var(--text-tertiary)",
                        fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem",
                        letterSpacing: "0.12em", padding: "0.35rem 0.75rem",
                        cursor: refreshing ? "not-allowed" : "pointer",
                        opacity: refreshing ? 0.5 : 1, transition: "color 150ms ease, border-color 150ms ease",
                        textTransform: "uppercase",
                    }}
                    onMouseEnter={(e) => { if (!refreshing) { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-gold)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold-border)"; } }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-default)"; }}
                >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ animation: refreshing ? "oracle-pulse 0.8s ease-in-out infinite" : "none" }}>
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    {refreshing ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {/* Challenge cards */}
            <div className="reveal-3">
                {visibleChallenges.length === 0 ? (
                    <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", color: "var(--text-tertiary)", fontSize: "0.95rem", textAlign: "center", padding: "3rem 0" }}>
                        The lobby is quiet. Post the first challenge and wait for a worthy opponent.
                    </p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                        {visibleChallenges.map((c) => {
                            const cardError = cardErrors[c.id];
                            const isAccepting = acceptingId === c.id;
                            const isDeleting = deletingId === c.id;

                            return (
                                <article key={c.id}>
                                    <div className="glass-card" style={{ padding: "1.25rem 1.4rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                                        <div style={{ flex: 1, minWidth: "12rem" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                                    {c.category ?? "General"}
                                                </span>
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.58rem", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                                                    · {c.creator ?? "Unknown"}{c.creatorElo != null ? ` · ${c.creatorElo} Elo` : ""}
                                                </span>
                                            </div>
                                            <h2 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.3, color: "var(--text-primary)" }}>
                                                {c.topicTitle}
                                            </h2>
                                        </div>

                                        {c.isMine ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", letterSpacing: "0.1em", color: "var(--text-gold)", border: "1px solid var(--gold-border)", background: "var(--gold-glow)", borderRadius: "var(--radius-sm)", padding: "0.4rem 0.85rem", textTransform: "uppercase" }}>
                                                    ◆ Yours
                                                </span>
                                                <button
                                                    onClick={() => handleDelete(c.id)}
                                                    disabled={isDeleting}
                                                    title="Withdraw this challenge"
                                                    style={{
                                                        background: "transparent", border: "1px solid var(--red-border)",
                                                        borderRadius: "var(--radius-sm)", color: "var(--red-neon)",
                                                        cursor: isDeleting ? "not-allowed" : "pointer",
                                                        padding: "0.4rem 0.7rem", fontFamily: "var(--font-share-tech), monospace",
                                                        fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase",
                                                        opacity: isDeleting ? 0.5 : 1, transition: "background 150ms ease, opacity 150ms ease",
                                                        display: "flex", alignItems: "center", gap: "0.35rem",
                                                    }}
                                                    onMouseEnter={(e) => { if (!isDeleting) (e.currentTarget as HTMLButtonElement).style.background = "var(--red-glow)"; }}
                                                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                                                >
                                                    {isDeleting ? (
                                                        <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;Withdrawing…</>
                                                    ) : (
                                                        <>
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                                                            </svg>
                                                            Withdraw
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleAccept(c.id)}
                                                disabled={acceptingId !== null}
                                                className="btn-oracle"
                                                style={{ fontSize: "0.65rem", letterSpacing: "0.15em", padding: "0.6rem 1.25rem", flexShrink: 0 }}
                                            >
                                                {isAccepting ? (
                                                    <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;Entering…</>
                                                ) : "Accept →"}
                                            </button>
                                        )}
                                    </div>

                                    {cardError && (
                                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.68rem", color: "var(--red-neon)", letterSpacing: "0.06em", marginTop: "0.4rem", padding: "0.5rem 0.85rem", background: "var(--red-glow)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)" }}>
                                            ⚠ {cardError}
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}