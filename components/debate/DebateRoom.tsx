"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { moderateContent, MIN_WORDS, wordCount as countWords } from "@/lib/moderation";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { ArgumentReactions } from "./ArgumentReactions";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

interface Argument {
    id: string;
    user_id: string;
    round_number: number;
    content: string;
    submitted_at: string;
    score_total: number | null;
    score_clarity: number | null;
    score_evidence: number | null;
    score_logic: number | null;
    score_rebuttal: number | null;
    fallacy_penalty: number | null;
    fallacies_found: { name: string; quote: string; explanation: string }[];
    ai_feedback: string | null;
    scoring_status: string;
}

interface Debate {
    id: string;
    status: string;
    mode: string;
    player_a_id: string;
    player_b_id: string | null;
    player_a_side: string;
    current_turn: string;
    winner_id: string | null;
    total_rounds: number;
    current_round: number;
    topics: { title: string; category: string | null };
    arguments: Argument[];
}

export function DebateRoom({
    debate: initialDebate,
    currentUserId,
    username = null,
}: {
    debate: Debate;
    currentUserId: string;
    username?: string | null;
}) {
    const [debate, setDebate] = useState(initialDebate);
    const [argument, setArgument] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(600);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [resigning, setResigning] = useState(false);
    const [resignConfirm, setResignConfirm] = useState(false);
    // Optimistic argument: shown immediately after submit, replaced by realtime.
    const [optimisticArg, setOptimisticArg] = useState<Argument | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Auto-grow textarea to fit content (mobile-friendly).
    const growTextarea = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    };

    const handleResign = async () => {
        if (!resignConfirm) { setResignConfirm(true); return; }
        setResigning(true);
        setError("");
        try {
            const res = await fetch(`/api/debates/${debate.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resign" }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to resign.");
                setResigning(false);
                setResignConfirm(false);
                return;
            }
            // Reflect the completed state immediately; realtime reconciles the
            // rest, so no router.refresh() (it forced a redundant full re-fetch
            // on top of the realtime update).
            if (data.debate) {
                setDebate((prev) => ({ ...prev, ...data.debate }));
            } else {
                setDebate((prev) => ({ ...prev, status: "completed" }));
            }
            clearInterval(timerRef.current!);
        } catch {
            setError("Failed to resign.");
        } finally {
            setResigning(false);
            setResignConfirm(false);
        }
    };


    const [shareUrl, setShareUrl] = useState("");
    // #7: argument reactions (completed public debates only).
    const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});
    const [myReactions, setMyReactions] = useState<Record<string, string>>({});
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const supabase = createClient();


    // Share URL read after mount — avoids SSR/client hydration mismatch
    useEffect(() => {
        setShareUrl(window.location.href);
    }, []);

    // Load reaction counts once the debate is completed.
    useEffect(() => {
        if (debate.status !== "completed") return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/reactions?debateId=${debate.id}`);
                const data = await res.json();
                if (cancelled) return;
                setReactionCounts(data.counts ?? {});
                setMyReactions(data.mine ?? {});
            } catch {
                /* non-critical */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debate.status, debate.id]);

    const isPlayerA = debate.player_a_id === currentUserId;
    const isMyTurn = debate.current_turn === currentUserId;
    const mySide = isPlayerA
        ? debate.player_a_side
        : debate.player_a_side === "FOR"
            ? "AGAINST"
            : "FOR";
    const totalPossible = debate.total_rounds * 80;

    // Derived values memoized so they aren't recomputed on every realtime event
    // or 1s timer tick. Only recompute when the arguments actually change.
    const { myArguments, opponentArguments, myScore, opponentScore } = useMemo(() => {
        const mine = debate.arguments.filter((a) => a.user_id === currentUserId);
        const opp = debate.arguments.filter((a) => a.user_id !== currentUserId);
        return {
            myArguments: mine,
            opponentArguments: opp,
            myScore: mine.reduce((sum, a) => sum + (a.score_total ?? 0), 0),
            opponentScore: opp.reduce((sum, a) => sum + (a.score_total ?? 0), 0),
        };
    }, [debate.arguments, currentUserId]);

    const wordCount = useMemo(() => countWords(argument), [argument]);

    // ── Realtime + polling fallback ──
    // Realtime is the fast path, but websockets drop silently on mobile (network
    // switches, tab backgrounding, channel errors), which previously made a
    // debate look frozen even when turns/scoring had advanced server-side. We
    // therefore (a) subscribe to realtime, and (b) run a lightweight poll of the
    // authoritative GET endpoint while the debate is live, which reconciles the
    // full state and clears any stale optimistic placeholder. Either path alone
    // is sufficient; together they make the room self-correcting.
    const reconcile = useCallback((next: Debate) => {
        setDebate((prev) => ({ ...prev, ...next, arguments: next.arguments ?? prev.arguments }));
        // Drop optimistic placeholder once the real row exists in the payload.
        setOptimisticArg((prev) =>
            prev && (next.arguments ?? []).some(
                (a) => a.user_id === prev.user_id && a.round_number === prev.round_number
            )
                ? null
                : prev
        );
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel(`debate:${debate.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "debates", filter: `id=eq.${debate.id}` },
                (payload) => { setDebate((prev) => ({ ...prev, ...(payload.new as Debate) })); })
            .on("postgres_changes", { event: "*", schema: "public", table: "arguments", filter: `debate_id=eq.${debate.id}` },
                (payload) => {
                    const incoming = payload.new as Argument;
                    // Once the real row arrives, drop the optimistic placeholder.
                    setOptimisticArg((prev) =>
                        prev && prev.user_id === incoming.user_id && prev.round_number === incoming.round_number
                            ? null
                            : prev
                    );
                    setDebate((prev) => {
                        const exists = prev.arguments.find((a) => a.id === incoming.id);
                        if (exists) return { ...prev, arguments: prev.arguments.map((a) => a.id === incoming.id ? incoming : a) };
                        return { ...prev, arguments: [...prev.arguments, incoming] };
                    });
                })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [debate.id]);

    // Polling fallback: only while the debate is live (not completed), so a
    // completed debate makes zero background requests. Reconciles every 8s.
    useEffect(() => {
        if (debate.status === "completed") return;
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch(`/api/debates/${debate.id}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data.debate) reconcile(data.debate as Debate);
            } catch {
                /* transient — next tick retries */
            }
        };
        const interval = setInterval(poll, 8000);
        // Reconcile immediately when the tab is refocused (mobile resume).
        const onVisible = () => { if (document.visibilityState === "visible") poll(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [debate.id, debate.status, reconcile]);

    // ── Timer ── (reacts to turn, round AND status changes)
    useEffect(() => {
        if (!isMyTurn || debate.status !== "active") return;
        setTimeLeft(600);
        timerRef.current = setInterval(() => {
            setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
        }, 1000);
        return () => clearInterval(timerRef.current!);
    }, [isMyTurn, debate.current_round, debate.status]);

    // ── Scoring self-heal ──
    // Backstop for a dropped scoring trigger (e.g. the original /api/score call
    // failed on a flaky mobile session). While one of MY arguments stays in a
    // non-terminal state, re-POST /api/score on a repeating interval (not just
    // once) so a failed retry is itself retried. The endpoint is idempotent and
    // returns 200 for already-scored rows, so this is always safe. The polling
    // fallback above also pulls in the score once it lands; together a viewer
    // recovers within seconds rather than waiting on the maintenance cron.
    useEffect(() => {
        const stuck = myArguments.find(
            (a) =>
                !a.id.startsWith("optimistic-") &&
                (a.scoring_status === "pending" || a.scoring_status === "scoring")
        );
        if (!stuck) return;
        const fire = () => {
            fetch("/api/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ argumentId: stuck.id }),
            }).catch(() => { });
        };
        const first = setTimeout(fire, 15000);
        const repeat = setInterval(fire, 20000);
        return () => { clearTimeout(first); clearInterval(repeat); };
    }, [myArguments]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    // ── handleJoin ──
    const handleJoin = async () => {
        const res = await fetch(`/api/debates/${debate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_b_id: currentUserId, status: "active", turn_started_at: new Date().toISOString() }),
        });
        const data = await res.json();
        if (data.debate) setDebate((prev) => ({ ...prev, ...data.debate }));
    };

    // ── handleSubmit ──
    // Optimistic: inject a local pending argument immediately so the player
    // sees their text in the feed without waiting for the server round-trip.
    // The real row arrives via realtime and replaces the placeholder.
    // On error the placeholder is removed and the textarea is restored.
    const handleSubmit = async () => {
        const trimmed = argument.trim();
        if (countWords(trimmed) < MIN_WORDS) { setError(`Argument must be at least ${MIN_WORDS} words.`); return; }
        const mod = moderateContent(trimmed);
        if (!mod.allowed) { setError(mod.reason ?? "Argument rejected."); return; }

        // Inject optimistic placeholder immediately.
        const placeholder: Argument = {
            id: `optimistic-${Date.now()}`,
            user_id: currentUserId,
            round_number: debate.current_round,
            content: trimmed,
            submitted_at: new Date().toISOString(),
            score_total: null,
            score_clarity: null,
            score_evidence: null,
            score_logic: null,
            score_rebuttal: null,
            fallacy_penalty: null,
            fallacies_found: [],
            ai_feedback: null,
            scoring_status: "pending",
        };
        setOptimisticArg(placeholder);
        setArgument("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        clearInterval(timerRef.current!);
        setSubmitting(true);
        setError("");

        try {
            const res = await fetch(`/api/debates/${debate.id}/argument`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) {
                // Roll back: remove placeholder and restore textarea.
                setOptimisticArg(null);
                setArgument(trimmed);
                setError(data.error ?? "Failed to submit argument.");
            }
            // On success realtime replaces the placeholder; nothing to do here.
        } catch {
            setOptimisticArg(null);
            setArgument(trimmed);
            setError("Failed to submit argument.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopy = async (text: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { }
    };

    const timerWarning = timeLeft < 120 && timeLeft > 0;
    const timerCritical = timeLeft < 60;

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)", display: "flex", flexDirection: "column" }}>

            {/* ── Navbar (hideJoinBar on debate page) ── */}
            <CircuitBackground intensity={0.45} />
            <Navbar username={username} hideJoinBar />

            {/* ── Debate header ── */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
                <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0.875rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }} className="debate-header-row">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                            {debate.mode.toUpperCase()} · Round {debate.current_round}/{debate.total_rounds}
                        </p>
                        <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(0.85rem, 2.5vw, 1.05rem)", fontWeight: 600, letterSpacing: "0.03em", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {debate.topics.title}
                        </h1>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexShrink: 0 }}>
                        {/* Round progress dots */}
                        <div style={{ display: "flex", gap: "0.3rem" }} aria-label={`Round ${debate.current_round} of ${debate.total_rounds}`}>
                            {Array.from({ length: debate.total_rounds }, (_, i) => (
                                <span
                                    key={i}
                                    style={{
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        background: i < debate.current_round ? "var(--gold)" : "var(--bg-elevated)",
                                        border: "1px solid var(--gold-border)",
                                        boxShadow: i < debate.current_round ? "0 0 6px rgba(201,168,76,0.5)" : "none",
                                        transition: "background 300ms ease, box-shadow 300ms ease",
                                        display: "inline-block",
                                    }}
                                />
                            ))}
                        </div>
                        <span className={mySide === "FOR" ? "badge-for" : "badge-against"}>
                            {mySide}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Score tribune ── */}
            {(debate.status === "active" || debate.status === "scoring" || debate.status === "completed") && (
                <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-glass)", backdropFilter: "blur(8px)" }}>
                    <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem" }} className="score-tribune">
                        {/* My score */}
                        <div style={{ textAlign: "left", minWidth: "4rem" }}>
                            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.5rem", color: "var(--gold)", letterSpacing: "0.06em", lineHeight: 1, textShadow: "0 0 16px rgba(201,168,76,0.35)" }}>{myScore}</p>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.52rem", letterSpacing: "0.2em", color: "var(--text-gold)", opacity: 0.8, textTransform: "uppercase" }}>You</p>
                        </div>

                        {/* Progress bar */}
                        <div className="score-tribune-bar" style={{ flex: 1, position: "relative" }}>
                            <div style={{ height: "2px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${totalPossible ? (myScore / totalPossible) * 100 : 0}%`, background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-bright) 100%)", borderRadius: "2px", transition: "width 0.8s ease", boxShadow: "0 0 6px rgba(201,168,76,0.4)" }} />
                            </div>
                            <p style={{ textAlign: "center", fontFamily: "var(--font-cinzel), serif", fontSize: "0.52rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginTop: "0.35rem" }}>Score</p>
                        </div>

                        {/* Opponent score */}
                        <div style={{ textAlign: "right", minWidth: "4rem" }}>
                            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "1.5rem", color: "var(--text-secondary)", letterSpacing: "0.06em", lineHeight: 1 }}>{opponentScore}</p>
                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.52rem", letterSpacing: "0.2em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>Opp.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main content ── */}
            <div style={{ flex: 1, maxWidth: "780px", margin: "0 auto", width: "100%", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

                {/* ═══ WAITING ═══ */}
                {debate.status === "waiting" && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1rem" }}>
                        {debate.player_a_id === currentUserId ? (
                            <div className="glass-card" style={{ width: "100%", maxWidth: "480px", padding: "2.5rem 2rem", textAlign: "center" }}>
                                {/* Pulsing seal */}
                                <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "center" }}>
                                    <svg width="56" height="56" viewBox="0 0 28 28" fill="none" style={{ animation: "oracle-pulse 2.5s ease-in-out infinite", filter: "drop-shadow(0 0 10px rgba(201,168,76,0.3))" }}>
                                        <polygon points="14,2 26,24 2,24" fill="none" stroke="var(--gold)" strokeWidth="1.25" strokeLinejoin="round" />
                                        <polygon points="14,8 21,21 7,21" fill="var(--gold-glow)" stroke="var(--gold-dim)" strokeWidth="0.75" strokeLinejoin="round" />
                                        <circle cx="14" cy="15" r="1.5" fill="var(--gold)" />
                                    </svg>
                                </div>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.65rem", letterSpacing: "0.24em", color: "var(--text-gold)", opacity: 1, textTransform: "uppercase", marginBottom: "0.75rem" }}>
                                    Awaiting Your Opponent
                                </p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: "1.75rem", lineHeight: 1.6 }}>
                                    Share the link below. The debate begins when they arrive.
                                </p>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <code style={{ flex: 1, fontFamily: "var(--font-share-tech), monospace", fontSize: "0.72rem", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "0.03em" }}>
                                        {shareUrl}
                                    </code>
                                    <button onClick={() => handleCopy(shareUrl)} style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.62rem", letterSpacing: "0.14em", fontWeight: 600, color: copied ? "var(--bg-void)" : "var(--text-gold)", background: copied ? "var(--gold)" : "var(--gold-glow)", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 1rem", cursor: "pointer", flexShrink: 0, transition: "all 200ms ease", textTransform: "uppercase" }}>
                                        {copied ? "✓ Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="glass-card" style={{ width: "100%", maxWidth: "480px", padding: "2.5rem 2rem", textAlign: "center" }}>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.65rem", letterSpacing: "0.24em", color: "var(--text-gold)", opacity: 1, textTransform: "uppercase", marginBottom: "1rem" }}>Challenge Received</p>
                                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>The motion before you:</p>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2rem", lineHeight: 1.4 }}>{debate.topics.title}</p>
                                <div className="gold-rule" style={{ marginBottom: "2rem" }} />
                                <button onClick={handleJoin} className="btn-oracle" style={{ width: "100%", justifyContent: "center" }}>
                                    Accept &amp; Enter the Arena →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ ACTIVE + SCORING ═══ */}
                {(debate.status === "active" || debate.status === "scoring") && (
                    <>
                        {[
                            ...debate.arguments,
                            // Append optimistic placeholder only if realtime hasn't
                            // delivered the real row yet (matched by user + round).
                            ...(optimisticArg &&
                                !debate.arguments.some(
                                    (a) =>
                                        a.user_id === optimisticArg.user_id &&
                                        a.round_number === optimisticArg.round_number
                                )
                                ? [optimisticArg]
                                : []),
                        ]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        style={{
                                            background: "var(--bg-glass)",
                                            backdropFilter: "blur(12px)",
                                            border: `1px solid ${isMine ? "var(--gold-border)" : "var(--teal-border)"}`,
                                            borderTop: `2px solid ${isMine ? "var(--gold)" : "var(--teal)"}`,
                                            borderRadius: "var(--radius-lg)",
                                            padding: "1.25rem",
                                            marginLeft: isMine ? "auto" : "0",
                                            marginRight: isMine ? "0" : "auto",
                                            width: "calc(100% - 0px)",
                                            boxShadow: isMine ? "var(--shadow-gold-sm)" : "var(--shadow-teal)",
                                            transition: "box-shadow 300ms ease",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                                            <span className={isMine ? "badge-for" : "badge-against"} style={{ fontSize: "0.55rem" }}>
                                                {isMine ? "You" : "Opponent"} · R{arg.round_number}
                                            </span>
                                            {arg.scoring_status === "done" && (
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: isMine ? "var(--gold)" : "var(--text-secondary)", letterSpacing: "0.06em" }}>
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>

                                        <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.7, opacity: 0.85 }}>
                                            {arg.content}
                                        </p>

                                        {arg.scoring_status === "scoring" && (
                                            <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.2em", color: "var(--text-gold)", opacity: 1, animation: "oracle-pulse 1.5s ease-in-out infinite" }}>
                                                ◆ Oracle deliberating…
                                            </p>
                                        )}
                                        {arg.scoring_status === "pending" && (
                                            <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.2em", color: "var(--text-tertiary)", animation: "oracle-pulse 2s ease-in-out infinite" }}>
                                                ◆ Queued…
                                            </p>
                                        )}
                                        {arg.scoring_status === "done" && <ScoreBreakdown argument={arg} />}
                                    </div>
                                );
                            })}

                        {/* Waiting for opponent */}
                        {!isMyTurn && debate.status === "active" && (
                            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "1.5rem", textAlign: "center" }}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
                                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)", animation: "oracle-pulse 1.8s ease-in-out infinite", flexShrink: 0, display: "inline-block" }} />
                                    <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.65rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                                        Awaiting opponent's argument
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Scoring all final */}
                        {debate.status === "scoring" && (
                            <div style={{ background: "var(--gold-glow)", border: "1px solid var(--gold-border)", borderRadius: "var(--radius-lg)", padding: "1.25rem", textAlign: "center" }}>
                                <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.65rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase", animation: "oracle-pulse 2s ease-in-out infinite" }}>
                                    ◆ Oracle scoring final arguments…
                                </p>
                            </div>
                        )}

                        {/* Input area */}
                        {isMyTurn && debate.status === "active" && (
                            <div
                                className="glass-card glass-card-gold"
                                style={{ padding: "1.25rem", boxShadow: "var(--shadow-gold)" }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase", opacity: 0.75 }}>
                                        Your Argument · Round {debate.current_round}
                                    </p>
                                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                        <span
                                            title="Minimum 10 words"
                                            style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.7rem", color: wordCount >= 10 || wordCount === 0 ? "var(--text-tertiary)" : "var(--red-neon)", letterSpacing: "0.06em", transition: "color 200ms ease" }}
                                        >
                                            {wordCount}w{wordCount > 0 && wordCount < 10 ? " / 10 min" : ""}
                                        </span>
                                        <span
                                            style={{
                                                fontFamily: "var(--font-share-tech), monospace",
                                                fontSize: timerCritical ? "1rem" : "0.82rem",
                                                letterSpacing: "0.08em",
                                                color: timerCritical ? "var(--red-neon)" : timerWarning ? "var(--gold)" : "var(--text-tertiary)",
                                                textShadow: timerCritical ? "0 0 10px var(--red-neon)" : timerWarning ? "0 0 8px rgba(201,168,76,0.4)" : "none",
                                                transition: "all 300ms ease",
                                                animation: timerCritical ? "oracle-pulse 1s ease-in-out infinite" : "none",
                                            }}
                                        >
                                            {formatTime(timeLeft)}
                                        </span>
                                    </div>
                                </div>

                                <textarea
                                    ref={textareaRef}
                                    value={argument}
                                    onChange={(e) => {
                                        setArgument(e.target.value);
                                        if (error) setError("");
                                        growTextarea();
                                    }}
                                    placeholder="Make your argument. Be specific, cite evidence, address your opponent…"
                                    rows={5}
                                    className="oracle-input"
                                    style={{
                                        resize: "none",
                                        marginBottom: "0.75rem",
                                        // Prevent iOS Safari from zooming on focus.
                                        fontSize: "16px",
                                        minHeight: "120px",
                                        overflowY: "hidden",
                                    }}
                                />

                                {error && (
                                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.7rem", color: "var(--red-neon)", letterSpacing: "0.06em", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--red-glow)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)" }}>
                                        ⚠ {error}
                                    </p>
                                )}

                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <button
                                        onClick={handleResign}
                                        disabled={resigning}
                                        style={{
                                            fontFamily: "var(--font-cinzel), serif",
                                            fontSize: "0.65rem",
                                            letterSpacing: "0.14em",
                                            padding: "0.7rem 1rem",
                                            background: "transparent",
                                            border: `1px solid ${resignConfirm ? "var(--red-neon)" : "var(--border-default)"}`,
                                            borderRadius: "var(--radius-md)",
                                            color: resignConfirm ? "var(--red-neon)" : "var(--text-tertiary)",
                                            cursor: "pointer",
                                            transition: "all 200ms ease",
                                            opacity: resigning ? 0.5 : 1,
                                        }}
                                    >
                                        {resigning ? "Resigning…" : resignConfirm ? "Confirm Resign" : "Resign"}
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="btn-oracle"
                                        style={{ fontSize: "0.7rem", letterSpacing: "0.18em", padding: "0.7rem 1.5rem" }}
                                    >
                                        {submitting ? (
                                            <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;Submitting…</>
                                        ) : "Submit →"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ═══ COMPLETED ═══ */}
                {debate.status === "completed" && (
                    <>
                        {[...debate.arguments]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        style={{
                                            background: "var(--bg-glass)",
                                            backdropFilter: "blur(12px)",
                                            border: `1px solid ${isMine ? "var(--gold-border)" : "var(--teal-border)"}`,
                                            borderTop: `2px solid ${isMine ? "var(--gold)" : "var(--teal)"}`,
                                            borderRadius: "var(--radius-lg)",
                                            padding: "1.25rem",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                                            <span className={isMine ? "badge-for" : "badge-against"} style={{ fontSize: "0.55rem" }}>
                                                {isMine ? "You" : "Opponent"} · R{arg.round_number}
                                            </span>
                                            {arg.scoring_status === "done" && (
                                                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: isMine ? "var(--gold)" : "var(--text-secondary)", letterSpacing: "0.06em" }}>
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontFamily: "var(--font-crimson), serif", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{arg.content}</p>
                                        {arg.scoring_status === "done" && <ScoreBreakdown argument={arg} />}
                                        <ArgumentReactions
                                            argumentId={arg.id}
                                            initialCounts={reactionCounts[arg.id] ?? {}}
                                            initialMine={myReactions[arg.id] ?? null}
                                            canReact={true}
                                        />
                                    </div>
                                );
                            })}

                        {/* Result card */}
                        {(() => {
                            // Honor an explicit winner_id (resign/forfeit) over the raw
                            // score comparison; fall back to scores when absent.
                            const won =
                                debate.winner_id != null
                                    ? debate.winner_id === currentUserId
                                    : myScore > opponentScore;
                            const tied = debate.winner_id == null && myScore === opponentScore;
                            return (
                                <div
                                    style={{
                                        background: won ? "var(--gold-glow)" : "var(--bg-surface)",
                                        border: `1px solid ${won ? "var(--gold-border-hover)" : "var(--border-default)"}`,
                                        borderTop: `2px solid ${won ? "var(--gold)" : "var(--border-default)"}`,
                                        borderRadius: "var(--radius-lg)",
                                        padding: "2.5rem 1.5rem",
                                        textAlign: "center",
                                        boxShadow: won ? "var(--shadow-gold)" : "none",
                                    }}
                                >
                                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.28em", color: "var(--text-gold)", opacity: 1, textTransform: "uppercase", marginBottom: "1.5rem" }}>
                                        Final Verdict
                                    </p>

                                    {/* Scores */}
                                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "2rem", marginBottom: "1.75rem" }}>
                                        <div>
                                            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "clamp(2.5rem, 8vw, 4rem)", color: "var(--gold)", lineHeight: 1, textShadow: won ? "0 0 30px rgba(201,168,76,0.5)" : "none" }}>{myScore}</p>
                                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", letterSpacing: "0.22em", color: "var(--text-gold)", opacity: 0.8, textTransform: "uppercase", marginTop: "0.4rem" }}>You</p>
                                        </div>
                                        <div style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--text-tertiary)" }}>VS</div>
                                        <div>
                                            <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "clamp(2.5rem, 8vw, 4rem)", color: won ? "var(--text-tertiary)" : "var(--text-secondary)", lineHeight: 1 }}>{opponentScore}</p>
                                            <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.55rem", letterSpacing: "0.22em", color: "var(--text-tertiary)", textTransform: "uppercase", marginTop: "0.4rem" }}>Opponent</p>
                                        </div>
                                    </div>

                                    <div className="gold-rule-subtle" style={{ marginBottom: "1.5rem" }} />

                                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)", fontWeight: 600, color: won ? "var(--gold)" : "var(--text-primary)", letterSpacing: "0.05em", marginBottom: "1.75rem" }}>
                                        {won ? "Victory. The Oracle rules in your favour." : tied ? "A draw. The Oracle finds you equal." : "Defeat. Study the verdict and return stronger."}
                                    </p>

                                    <div className="result-actions" style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                                        {/* #5: Primary share = X/Twitter intent. The /api/og image
                                            renders the preview card automatically from the URL. */}
                                        <a
                                            href={shareUrl ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                                                `I just debated "${debate.topics.title}" on Argos | Score: ${myScore}-${opponentScore}`
                                            )}&url=${encodeURIComponent(shareUrl)}` : "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn-oracle"
                                            style={{ textDecoration: "none" }}
                                            aria-label="Share this result on X"
                                        >
                                            Share on X
                                        </a>
                                        {/* Secondary fallback: copy link (unchanged behaviour) */}
                                        <button
                                            onClick={() => handleCopy(shareUrl)}
                                            className="btn-ghost"
                                        >
                                            {copied ? "✓ Copied" : "Copy Link"}
                                        </button>
                                        <a href="/dashboard" className="btn-ghost" style={{ textDecoration: "none" }}>
                                            Return to Arena →
                                        </a>
                                    </div>
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>
        </div>
    );
}