"use client";

import { useState, useEffect } from "react";

/** Count-up hook — eases an integer from 0 to `target`. */
function useCountUp(target: number, duration = 1000) {
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

/**
 * Win-rate stat panel with a count-up number and a rising teal "liquid" fill
 * that rocks like a wave. Self-animating client island — usable from server
 * components (dashboard + profile).
 */
export function LiquidWinRate({ rate, minHeight = "100px" }: { rate: number; minHeight?: string }) {
    const animated = useCountUp(rate, 1000);
    return (
        <div className="scanlines" style={{ background: "var(--bg-surface)", padding: "1.25rem 1rem", textAlign: "center", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight }}>
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
