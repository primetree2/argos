"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_TOPICS = [
    "Social media does more harm than good",
    "AI will eliminate more jobs than it creates",
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
        if (!topic.trim()) { setError("Enter a topic to continue"); return; }
        setLoading(true);
        setError("");
        const res = await fetch("/api/debates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, mode, totalRounds: rounds }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Something went wrong"); setLoading(false); return; }
        router.push(`/debate/${data.debate.id}`);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <nav className="border-b border-white/5 px-8 py-4 flex items-center gap-4">
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-white/30 hover:text-white transition-colors text-sm"
                >
                    ← Back
                </button>
                <span className="text-white/10">|</span>
                <span className="text-xs text-white/30 font-mono tracking-widest">NEW DEBATE</span>
            </nav>

            <main className="max-w-lg mx-auto px-8 py-12">
                <p className="text-[#f59e0b] font-mono text-xs tracking-widest mb-2">SETUP</p>
                <h1 className="text-2xl font-bold tracking-tight mb-8">Configure your debate</h1>

                {/* Topic */}
                <div className="mb-6">
                    <label className="block text-[10px] font-mono text-white/30 tracking-widest mb-2">
                        TOPIC
                    </label>
                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="State your debate topic clearly..."
                        className="w-full rounded-[6px] border border-white/8 bg-[#111] px-4 py-3 text-white placeholder-white/15 resize-none focus:outline-none focus:border-[#f59e0b]/40 focus:shadow-[0_0_15px_rgba(245,158,11,0.08)] transition-all duration-200 text-sm"
                        rows={3}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                        {SAMPLE_TOPICS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTopic(t)}
                                className="text-[11px] px-3 py-1 rounded-[4px] border border-white/8 text-white/30 hover:text-white/60 hover:border-white/15 transition-all duration-150"
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mode */}
                <div className="mb-6">
                    <label className="block text-[10px] font-mono text-white/30 tracking-widest mb-2">
                        MODE
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {(["casual", "ranked"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`rounded-[6px] border p-4 text-left transition-all duration-200 ${mode === m
                                        ? "border-[#f59e0b]/40 bg-[#f59e0b]/5 shadow-[0_0_15px_rgba(245,158,11,0.08)]"
                                        : "border-white/5 bg-[#111] hover:border-white/10"
                                    }`}
                            >
                                <p className={`text-sm font-semibold capitalize ${mode === m ? "text-[#f59e0b]" : "text-white"}`}>
                                    {m}
                                </p>
                                <p className="text-xs text-white/30 mt-1">
                                    {m === "casual" ? "No Elo changes" : "Elo rating affected"}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rounds */}
                <div className="mb-8">
                    <label className="block text-[10px] font-mono text-white/30 tracking-widest mb-2">
                        ROUNDS — <span className="text-[#f59e0b]">{rounds}</span>
                    </label>
                    <input
                        type="range" min={2} max={5} value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                        className="w-full accent-[#f59e0b]"
                    />
                    <div className="flex justify-between text-[10px] text-white/20 font-mono mt-1">
                        <span>2</span><span>5</span>
                    </div>
                </div>

                {error && <p className="mb-4 text-xs text-red-400 font-mono">{error}</p>}

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full rounded-[6px] bg-[#f59e0b] text-black font-bold py-3.5 hover:bg-[#fbbf24] transition-all duration-200 disabled:opacity-40 text-sm tracking-wide shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)]"
                >
                    {loading ? "CREATING..." : "CREATE DEBATE →"}
                </button>
            </main>
        </div>
    );
}