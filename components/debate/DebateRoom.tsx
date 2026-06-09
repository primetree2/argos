"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ScoreBreakdown } from "./ScoreBreakdown";

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
    total_rounds: number;
    current_round: number;
    topics: { title: string; category: string | null };
    arguments: Argument[];
}

export function DebateRoom({
    debate: initialDebate,
    currentUserId,
}: {
    debate: Debate;
    currentUserId: string;
}) {
    const [debate, setDebate] = useState(initialDebate);
    const [argument, setArgument] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
    const [error, setError] = useState("");
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const supabase = createClient();

    const isPlayerA = debate.player_a_id === currentUserId;
    const myArguments = debate.arguments.filter(
        (a) => a.user_id === currentUserId
    );
    const opponentArguments = debate.arguments.filter(
        (a) => a.user_id !== currentUserId
    );
    const isMyTurn = debate.current_turn === currentUserId;
    const myScore = myArguments.reduce(
        (sum, a) => sum + (a.score_total ?? 0),
        0
    );
    const opponentScore = opponentArguments.reduce(
        (sum, a) => sum + (a.score_total ?? 0),
        0
    );
    const mySide = isPlayerA ? debate.player_a_side : debate.player_a_side === "FOR" ? "AGAINST" : "FOR";

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel(`debate:${debate.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "debates",
                    filter: `id=eq.${debate.id}`,
                },
                (payload) => {
                    setDebate((prev) => ({ ...prev, ...(payload.new as Debate) }));
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "arguments",
                    filter: `debate_id=eq.${debate.id}`,
                },
                (payload) => {
                    setDebate((prev) => {
                        const exists = prev.arguments.find(
                            (a) => a.id === (payload.new as Argument).id
                        );
                        if (exists) {
                            return {
                                ...prev,
                                arguments: prev.arguments.map((a) =>
                                    a.id === (payload.new as Argument).id
                                        ? (payload.new as Argument)
                                        : a
                                ),
                            };
                        }
                        return {
                            ...prev,
                            arguments: [...prev.arguments, payload.new as Argument],
                        };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [debate.id]);

    // Timer
    useEffect(() => {
        if (!isMyTurn || debate.status !== "active") return;
        setTimeLeft(600);
        timerRef.current = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current!);
    }, [isMyTurn, debate.current_round]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const handleJoin = async () => {
        const res = await fetch(`/api/debates/${debate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                player_b_id: currentUserId,
                status: "active",
            }),
        });
        const data = await res.json();
        if (data.debate) setDebate((prev) => ({ ...prev, ...data.debate }));
    };

    const handleSubmit = async () => {
        if (!argument.trim() || argument.trim().split(" ").length < 10) {
            setError("Argument must be at least 10 words");
            return;
        }
        setSubmitting(true);
        setError("");

        // Save argument
        const { data: newArg, error: argError } = await supabase
            .from("arguments")
            .insert({
                debate_id: debate.id,
                user_id: currentUserId,
                round_number: debate.current_round,
                content: argument.trim(),
                scoring_status: "pending",
            })
            .select()
            .single();

        if (argError || !newArg) {
            setError("Failed to submit argument");
            setSubmitting(false);
            return;
        }

        // Fetch fresh debate state before updating turn
        const { data: freshDebate } = await supabase
            .from("debates")
            .select("player_a_id, player_b_id, current_round, total_rounds")
            .eq("id", debate.id)
            .single();

        if (!freshDebate) {
            setError("Failed to update debate state");
            setSubmitting(false);
            return;
        }

        const opponentId = freshDebate.player_a_id === currentUserId
            ? freshDebate.player_b_id
            : freshDebate.player_a_id;

        const argsThisRound = debate.arguments.filter(
            (a) => a.round_number === debate.current_round
        ).length;
        const isLastArgOfRound = argsThisRound >= 1;
        const nextRound = isLastArgOfRound
            ? debate.current_round + 1
            : debate.current_round;
        const isLastRound = debate.current_round === debate.total_rounds;
        const isFinalSubmission = isLastArgOfRound && isLastRound;

        await fetch(`/api/debates/${debate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                current_turn: opponentId,
                current_round: nextRound,
                status: isFinalSubmission ? "scoring" : "active",
            }),
        });

        // Trigger scoring
        fetch("/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ argumentId: newArg.id }),
        });

        setArgument("");
        setSubmitting(false);
        clearInterval(timerRef.current!);
    };

    const wordCount = argument.trim()
        ? argument.trim().split(/\s+/).length
        : 0;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
            {/* Header */}
            <div className="border-b border-white/5 px-8 py-4">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-mono text-white/20 tracking-widest mb-1">
                            {debate.mode.toUpperCase()} · ROUND {debate.current_round}/{debate.total_rounds}
                        </p>
                        <h1 className="text-base font-semibold tracking-tight">{debate.topics.title}</h1>
                    </div>
                    <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-[4px] border tracking-wider ${mySide === "FOR"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                        {mySide}
                    </span>
                </div>
            </div>

            {/* Score bar */}
            <div className="border-b border-white/5 px-8 py-3">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-[#f59e0b]">{myScore} <span className="text-[#f59e0b]/40 text-xs">YOU</span></span>
                    <span className="text-[10px] font-mono text-white/15 tracking-widest">SCORE</span>
                    <span className="font-mono text-sm font-bold text-white/40">{opponentScore} <span className="text-white/20 text-xs">OPP</span></span>
                </div>
            </div>

            <div className="flex-1 max-w-3xl mx-auto w-full px-8 py-8 space-y-4">

                {/* Waiting state */}
                {debate.status === "waiting" && (
                    <div className="rounded-[6px] border border-white/5 bg-[#111] p-8 text-center">
                        {debate.player_a_id === currentUserId ? (
                            <>
                                <p className="text-[10px] font-mono text-white/20 tracking-widest mb-4">WAITING FOR OPPONENT</p>
                                <p className="text-white/40 text-sm mb-6">Share this link to start the debate</p>
                                <div className="flex gap-2 justify-center max-w-sm mx-auto">
                                    <code className="flex-1 text-xs bg-white/5 border border-white/5 px-3 py-2 rounded-[4px] text-white/40 truncate font-mono">
                                        {typeof window !== "undefined" ? window.location.href : ""}
                                    </code>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(window.location.href);
                                            } catch {
                                                // Clipboard not available — silently ignore
                                            }
                                        }}
                                        className="text-xs px-3 py-2 rounded-[4px] bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/20 transition-all"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] font-mono text-white/20 tracking-widest mb-4">CHALLENGE RECEIVED</p>
                                <p className="text-white/60 text-sm mb-2">You've been challenged</p>
                                <p className="text-white font-semibold mb-8">{debate.topics.title}</p>
                                <button
                                    onClick={handleJoin}
                                    className="bg-[#f59e0b] text-black font-bold px-8 py-3 rounded-[6px] hover:bg-[#fbbf24] transition-all text-sm tracking-wide shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                                >
                                    ACCEPT & JOIN →
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Active + scoring */}
                {(debate.status === "active" || debate.status === "scoring") && (
                    <>
                        {[...debate.arguments]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        className={`rounded-[6px] border p-5 transition-all duration-300 ${isMine
                                            ? "border-[#f59e0b]/15 bg-[#f59e0b]/3"
                                            : "border-white/5 bg-[#111]"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-mono tracking-widest text-white/20">
                                                {isMine ? "YOU" : "OPPONENT"} · ROUND {arg.round_number}
                                            </p>
                                            {arg.scoring_status === "done" && (
                                                <span className={`text-xs font-mono font-bold ${isMine ? "text-[#f59e0b]" : "text-white/40"}`}>
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-white/70 text-sm leading-relaxed">{arg.content}</p>
                                        {arg.scoring_status === "scoring" && (
                                            <p className="mt-3 text-[11px] font-mono text-[#f59e0b]/50 animate-pulse tracking-wider">
                                                AI SCORING...
                                            </p>
                                        )}
                                        {arg.scoring_status === "pending" && (
                                            <p className="mt-3 text-[11px] font-mono text-white/20 animate-pulse tracking-wider">
                                                QUEUED...
                                            </p>
                                        )}
                                        {arg.scoring_status === "done" && <ScoreBreakdown argument={arg} />}
                                    </div>
                                );
                            })}

                        {!isMyTurn && debate.status === "active" && (
                            <div className="rounded-[6px] border border-white/5 bg-[#111] p-5 text-center">
                                <p className="text-[11px] font-mono text-white/20 animate-pulse tracking-widest">
                                    WAITING FOR OPPONENT...
                                </p>
                            </div>
                        )}

                        {debate.status === "scoring" && (
                            <div className="rounded-[6px] border border-[#f59e0b]/10 bg-[#f59e0b]/3 p-5 text-center">
                                <p className="text-[11px] font-mono text-[#f59e0b]/50 animate-pulse tracking-widest">
                                    AI SCORING FINAL ARGUMENTS...
                                </p>
                            </div>
                        )}

                        {isMyTurn && debate.status === "active" && (
                            <div className="rounded-[6px] border border-[#f59e0b]/25 bg-[#f59e0b]/3 p-5 shadow-[0_0_20px_rgba(245,158,11,0.06)]">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-mono text-[#f59e0b]/60 tracking-widest">YOUR ARGUMENT</p>
                                    <div className="flex items-center gap-4 text-[11px] font-mono">
                                        <span className="text-white/20">{wordCount} words</span>
                                        <span className={timeLeft < 60 ? "text-red-400" : "text-white/20"}>
                                            {formatTime(timeLeft)}
                                        </span>
                                    </div>
                                </div>
                                <textarea
                                    value={argument}
                                    onChange={(e) => setArgument(e.target.value)}
                                    placeholder="Make your argument. Be specific, cite evidence, address your opponent..."
                                    className="w-full rounded-[4px] border border-white/5 bg-black/40 px-4 py-3 text-white placeholder-white/15 resize-none focus:outline-none focus:border-[#f59e0b]/20 transition-all text-sm leading-relaxed"
                                    rows={5}
                                />
                                {error && <p className="mt-2 text-xs text-red-400 font-mono">{error}</p>}
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="bg-[#f59e0b] text-black font-bold px-6 py-2.5 rounded-[4px] hover:bg-[#fbbf24] transition-all disabled:opacity-40 text-xs tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                    >
                                        {submitting ? "SUBMITTING..." : "SUBMIT →"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Completed */}
                {debate.status === "completed" && (
                    <>
                        {[...debate.arguments]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        className={`rounded-[6px] border p-5 ${isMine ? "border-[#f59e0b]/15 bg-[#f59e0b]/3" : "border-white/5 bg-[#111]"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-mono tracking-widest text-white/20">
                                                {isMine ? "YOU" : "OPPONENT"} · ROUND {arg.round_number}
                                            </p>
                                            {arg.scoring_status === "done" && (
                                                <span className={`text-xs font-mono font-bold ${isMine ? "text-[#f59e0b]" : "text-white/40"}`}>
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-white/60 text-sm leading-relaxed">{arg.content}</p>
                                        {arg.scoring_status === "done" && <ScoreBreakdown argument={arg} />}
                                    </div>
                                );
                            })}

                        {/* Result card */}
                        <div className={`rounded-[6px] border p-8 text-center ${myScore > opponentScore
                            ? "border-[#f59e0b]/30 bg-[#f59e0b]/5 shadow-[0_0_40px_rgba(245,158,11,0.1)]"
                            : "border-white/5 bg-[#111]"
                            }`}>
                            <p className="text-[10px] font-mono tracking-widest text-white/20 mb-6">FINAL RESULT</p>
                            <div className="flex justify-center gap-16 mb-8">
                                <div>
                                    <p className="text-5xl font-bold font-mono text-[#f59e0b]">{myScore}</p>
                                    <p className="text-[10px] font-mono text-white/20 mt-2 tracking-widest">YOU</p>
                                </div>
                                <div className="text-white/10 font-mono text-2xl self-center">VS</div>
                                <div>
                                    <p className="text-5xl font-bold font-mono text-white/30">{opponentScore}</p>
                                    <p className="text-[10px] font-mono text-white/20 mt-2 tracking-widest">OPPONENT</p>
                                </div>
                            </div>
                            <p className="text-lg font-bold mb-6">
                                {myScore > opponentScore
                                    ? "🏆 You won this debate."
                                    : myScore < opponentScore
                                        ? "You lost. Study the feedback and come back stronger."
                                        : "Dead even. Rematch?"}
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(window.location.href);
                                        } catch {
                                            // Clipboard not available — silently ignore
                                        }
                                        alert("Link copied!");
                                    }}
                                    className="border border-white/10 text-white/40 px-5 py-2.5 rounded-[4px] hover:bg-white/5 transition-all text-xs font-mono tracking-wider"
                                >
                                    SHARE
                                </button>
                                <button

                                    className="bg-[#f59e0b] text-black font-bold px-5 py-2.5 rounded-[4px] hover:bg-[#fbbf24] transition-all text-xs tracking-wider"
                                >
                                    BACK TO HOME →
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}