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
    const lastOpponentArg = opponentArguments.sort(
        (a, b) => b.round_number - a.round_number
    )[0];
    const myLastArg = myArguments.sort(
        (a, b) => b.round_number - a.round_number
    )[0];

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
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* Header */}
            <div className="border-b border-white/10 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
                            {debate.mode} · Round {debate.current_round}/{debate.total_rounds}
                        </p>
                        <h1 className="text-lg font-semibold">{debate.topics.title}</h1>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-white/40 mb-1">Your side</p>
                        <span
                            className={`text-sm font-bold px-3 py-1 rounded-full ${mySide === "FOR"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-red-500/20 text-red-400"
                                }`}
                        >
                            {mySide}
                        </span>
                    </div>
                </div>
            </div>

            {/* Score bar */}
            <div className="border-b border-white/10 px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
                    <span className="font-mono text-green-400">{myScore} pts (You)</span>
                    <span className="text-white/30 text-xs">SCORE</span>
                    <span className="font-mono text-red-400">
                        {opponentScore} pts (Opponent)
                    </span>
                </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
                {/* Waiting state */}
                {debate.status === "waiting" && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                        {debate.player_a_id === currentUserId ? (
                            <>
                                <p className="text-white/60 mb-2">Waiting for opponent...</p>
                                <p className="text-xs text-white/30 mb-4">
                                    Share this link to invite someone:
                                </p>
                                <div className="flex gap-2 justify-center">
                                    <code className="text-xs bg-white/10 px-3 py-2 rounded-lg text-white/70">
                                        {typeof window !== "undefined"
                                            ? window.location.href
                                            : ""}
                                    </code>
                                    <button
                                        onClick={() =>
                                            navigator.clipboard.writeText(window.location.href)
                                        }
                                        className="text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-white/60 mb-4">
                                    You've been challenged to a debate!
                                </p>
                                <p className="text-sm text-white/40 mb-6">
                                    Topic: <strong className="text-white">{debate.topics.title}</strong>
                                </p>
                                <button
                                    onClick={handleJoin}
                                    className="bg-white text-black font-semibold px-8 py-3 rounded-xl hover:bg-white/90 transition"
                                >
                                    Accept & Join Debate
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Active debate + scoring state — arguments always visible */}
                {(debate.status === "active" || debate.status === "scoring") && (
                    <>
                        {[...debate.arguments]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        className={`rounded-xl border p-6 ${isMine
                                            ? "border-green-500/20 bg-green-500/5"
                                            : "border-white/10 bg-white/5"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-xs text-white/40 uppercase tracking-wider">
                                                {isMine ? "You" : "Opponent"} · Round {arg.round_number}
                                            </p>
                                            {arg.scoring_status === "done" && (
                                                <span className="text-xs font-mono font-bold text-white/60">
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>
                                        <p className={`leading-relaxed ${isMine ? "text-green-100/80" : "text-white/80"}`}>
                                            {arg.content}
                                        </p>
                                        {arg.scoring_status === "scoring" && (
                                            <p className="mt-3 text-xs text-yellow-400/70 animate-pulse">
                                                AI is scoring this argument...
                                            </p>
                                        )}
                                        {arg.scoring_status === "pending" && (
                                            <p className="mt-3 text-xs text-white/30 animate-pulse">
                                                Waiting to score...
                                            </p>
                                        )}
                                        {arg.scoring_status === "done" && (
                                            <ScoreBreakdown argument={arg} />
                                        )}
                                    </div>
                                );
                            })}

                        {/* Waiting for opponent */}
                        {!isMyTurn && debate.status === "active" && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                                <p className="text-white/40 animate-pulse">
                                    Waiting for opponent's argument...
                                </p>
                            </div>
                        )}

                        {/* Scoring in progress — final round */}
                        {debate.status === "scoring" && (
                            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-6 text-center">
                                <p className="text-yellow-400/70 animate-pulse text-sm">
                                    AI is scoring the final arguments...
                                </p>
                            </div>
                        )}

                        {/* My turn input */}
                        {isMyTurn && debate.status === "active" && (
                            <div className="rounded-xl border border-white/20 bg-white/5 p-6">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-medium">Your argument</p>
                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="text-white/40">{wordCount} words</span>
                                        <span className={`font-mono ${timeLeft < 60 ? "text-red-400" : "text-white/40"}`}>
                                            {formatTime(timeLeft)}
                                        </span>
                                    </div>
                                </div>
                                <textarea
                                    value={argument}
                                    onChange={(e) => setArgument(e.target.value)}
                                    placeholder="Make your argument here. Be clear, cite evidence, and address your opponent's points..."
                                    className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white placeholder-white/20 resize-none focus:outline-none focus:border-white/30 transition"
                                    rows={6}
                                />
                                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="bg-white text-black font-semibold px-6 py-2 rounded-lg hover:bg-white/90 transition disabled:opacity-50"
                                    >
                                        {submitting ? "Submitting..." : "Submit Argument →"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Completed — show all arguments + results */}
                {debate.status === "completed" && (
                    <>
                        {[...debate.arguments]
                            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
                            .map((arg) => {
                                const isMine = arg.user_id === currentUserId;
                                return (
                                    <div
                                        key={arg.id}
                                        className={`rounded-xl border p-6 ${isMine
                                            ? "border-green-500/20 bg-green-500/5"
                                            : "border-white/10 bg-white/5"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-xs text-white/40 uppercase tracking-wider">
                                                {isMine ? "You" : "Opponent"} · Round {arg.round_number}
                                            </p>
                                            {arg.scoring_status === "done" && (
                                                <span className="text-xs font-mono font-bold text-white/60">
                                                    {arg.score_total}/80
                                                </span>
                                            )}
                                        </div>
                                        <p className={`leading-relaxed text-sm ${isMine ? "text-green-100/70" : "text-white/70"}`}>
                                            {arg.content}
                                        </p>
                                        {arg.scoring_status === "done" && (
                                            <ScoreBreakdown argument={arg} />
                                        )}
                                    </div>
                                );
                            })}

                        {/* Final result card */}
                        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                            <p className="text-2xl font-bold mb-2">Debate Complete!</p>
                            <p className="text-white/40 mb-6">Final Scores</p>
                            <div className="flex justify-center gap-12">
                                <div>
                                    <p className="text-4xl font-bold text-green-400">{myScore}</p>
                                    <p className="text-xs text-white/40 mt-1">You</p>
                                </div>
                                <div>
                                    <p className="text-4xl font-bold text-red-400">{opponentScore}</p>
                                    <p className="text-xs text-white/40 mt-1">Opponent</p>
                                </div>
                            </div>
                            <p className="mt-6 text-lg font-semibold">
                                {myScore > opponentScore
                                    ? "🏆 You won!"
                                    : myScore < opponentScore
                                        ? "You lost. Better luck next time."
                                        : "It's a tie!"}
                            </p>
                            <button
                                onClick={() => (window.location.href = "/dashboard")}
                                className="mt-6 bg-white text-black font-semibold px-6 py-2 rounded-lg hover:bg-white/90 transition"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}