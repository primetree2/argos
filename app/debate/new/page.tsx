"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_TOPICS = [
    "Social media does more harm than good",
    "Artificial intelligence will eliminate more jobs than it creates",
    "Universal basic income should be implemented globally",
    "Space exploration is worth the cost",
    "Homework should be abolished in schools",
];

export default function NewDebatePage() {
    const router = useRouter();
    const [topic, setTopic] = useState("");
    const [mode, setMode] = useState<"casual" | "ranked">("casual");
    const [rounds, setRounds] = useState(3);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleCreate = async () => {
        if (!topic.trim()) {
            setError("Please enter a topic");
            return;
        }
        setLoading(true);
        setError("");

        const res = await fetch("/api/debates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, mode, totalRounds: rounds }),
        });

        const data = await res.json();

        if (!res.ok) {
            setError(data.error ?? "Something went wrong");
            setLoading(false);
            return;
        }

        router.push(`/debate/${data.debate.id}`);
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <nav className="border-b border-white/10 px-6 py-4">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-white/50 hover:text-white transition text-sm"
                >
                    ← Back to dashboard
                </button>
            </nav>

            <main className="max-w-xl mx-auto px-6 py-12">
                <h1 className="text-3xl font-bold mb-2">New Debate</h1>
                <p className="text-white/40 mb-8">Set your topic and challenge settings</p>

                {/* Topic input */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-white/70 mb-2">
                        Debate Topic
                    </label>
                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g. Social media does more harm than good"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 resize-none focus:outline-none focus:border-white/30 transition"
                        rows={3}
                    />
                    <p className="mt-2 text-xs text-white/30">Or pick a sample topic:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {SAMPLE_TOPICS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTopic(t)}
                                className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition text-white/50 hover:text-white"
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mode */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-white/70 mb-2">
                        Mode
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {(["casual", "ranked"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`rounded-xl border p-4 text-left transition ${mode === m
                                        ? "border-white bg-white/10"
                                        : "border-white/10 bg-white/5 hover:bg-white/10"
                                    }`}
                            >
                                <p className="font-medium capitalize">{m}</p>
                                <p className="text-xs text-white/40 mt-1">
                                    {m === "casual"
                                        ? "No Elo changes. Just for fun."
                                        : "Elo rating affected. Competitive."}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rounds */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-white/70 mb-2">
                        Rounds: <span className="text-white">{rounds}</span>
                    </label>
                    <input
                        type="range"
                        min={2}
                        max={5}
                        value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                        className="w-full accent-white"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                        <span>2 rounds</span>
                        <span>5 rounds</span>
                    </div>
                </div>

                {error && (
                    <p className="mb-4 text-sm text-red-400">{error}</p>
                )}

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full rounded-xl bg-white text-black font-semibold py-3 hover:bg-white/90 transition disabled:opacity-50"
                >
                    {loading ? "Creating..." : "Create Debate →"}
                </button>
            </main>
        </div>
    );
}