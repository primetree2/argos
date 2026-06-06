interface Argument {
    score_clarity: number | null;
    score_evidence: number | null;
    score_logic: number | null;
    score_rebuttal: number | null;
    fallacy_penalty: number | null;
    fallacies_found: { name: string; quote: string; explanation: string }[];
    ai_feedback: string | null;
    score_total: number | null;
}

export function ScoreBreakdown({ argument: arg }: { argument: Argument }) {
    const dims = [
        { label: "Clarity", value: arg.score_clarity, max: 20 },
        { label: "Evidence", value: arg.score_evidence, max: 20 },
        { label: "Logic", value: arg.score_logic, max: 20 },
        { label: "Rebuttal", value: arg.score_rebuttal, max: 20 },
    ];

    return (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
            {dims.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                    <span className="text-xs text-white/40 w-16">{d.label}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-white/60 rounded-full transition-all"
                            style={{ width: `${((d.value ?? 0) / d.max) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-mono text-white/60">
                        {d.value ?? 0}/{d.max}
                    </span>
                </div>
            ))}

            {(arg.fallacy_penalty ?? 0) < 0 && (
                <div className="mt-2 space-y-2">
                    {arg.fallacies_found?.map((f, i) => (
                        <div
                            key={i}
                            className="rounded-lg bg-red-500/10 border border-red-500/20 p-3"
                        >
                            <p className="text-xs font-semibold text-red-400">
                                ⚠ {f.name}
                            </p>
                            <p className="text-xs text-white/40 mt-1 italic">
                                "{f.quote}"
                            </p>
                            <p className="text-xs text-white/50 mt-1">{f.explanation}</p>
                        </div>
                    ))}
                </div>
            )}

            {arg.ai_feedback && (
                <div className="rounded-lg bg-white/5 p-3 mt-2">
                    <p className="text-xs text-white/40 mb-1">AI Feedback</p>
                    <p className="text-xs text-white/70 leading-relaxed">
                        {arg.ai_feedback}
                    </p>
                </div>
            )}
        </div>
    );
}