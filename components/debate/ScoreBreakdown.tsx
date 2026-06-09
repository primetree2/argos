"use client";

import { useEffect, useState } from "react";

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

function AnimatedBar({ value, max }: { value: number; max: number }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth((value / max) * 100), 100);
        return () => clearTimeout(t);
    }, [value, max]);

    const pct = (value / max) * 100;
    const color = pct >= 70 ? "#f59e0b" : pct >= 40 ? "#f59e0b99" : "#f59e0b44";

    return (
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${width}%`, backgroundColor: color }}
            />
        </div>
    );
}

function CountUp({ target }: { target: number }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        let start = 0;
        const steps = 20;
        const inc = target / steps;
        const t = setInterval(() => {
            start += inc;
            if (start >= target) { setVal(target); clearInterval(t); }
            else setVal(Math.floor(start));
        }, 30);
        return () => clearInterval(t);
    }, [target]);
    return <>{val}</>;
}

export function ScoreBreakdown({ argument: arg }: { argument: Argument }) {
    const dims = [
        { label: "CLARITY", value: arg.score_clarity ?? 0, max: 20 },
        { label: "EVIDENCE", value: arg.score_evidence ?? 0, max: 20 },
        { label: "LOGIC", value: arg.score_logic ?? 0, max: 20 },
        { label: "REBUTTAL", value: arg.score_rebuttal ?? 0, max: 20 },
    ];

    return (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            {dims.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/20 w-16 tracking-wider">{d.label}</span>
                    <AnimatedBar value={d.value} max={d.max} />
                    <span className="text-xs font-mono text-white/40 w-10 text-right">
                        <CountUp target={d.value} />/{d.max}
                    </span>
                </div>
            ))}

            {(arg.fallacy_penalty ?? 0) < 0 && (
                <div className="mt-3 space-y-2">
                    {arg.fallacies_found?.map((f, i) => (
                        <div key={i} className="rounded-[6px] bg-red-500/5 border border-red-500/15 p-3">
                            <p className="text-xs font-mono font-semibold text-red-400 tracking-wider">
                                ⚠ {f.name.toUpperCase()}
                            </p>
                            <p className="text-[11px] text-white/30 mt-1 italic">"{f.quote}"</p>
                            <p className="text-[11px] text-white/40 mt-1">{f.explanation}</p>
                        </div>
                    ))}
                </div>
            )}

            {arg.ai_feedback && (
                <div className="rounded-[6px] bg-[#f59e0b]/5 border border-[#f59e0b]/10 p-3 mt-2">
                    <p className="text-[10px] font-mono text-[#f59e0b]/60 tracking-widest mb-1">AI FEEDBACK</p>
                    <p className="text-xs text-white/50 leading-relaxed">{arg.ai_feedback}</p>
                </div>
            )}
        </div>
    );
}