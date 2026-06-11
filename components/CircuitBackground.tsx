"use client";

/*
  CircuitBackground
  ─────────────────
  Fixed behind all content. Gold traces dominate; a few teal ones accent.
  Two layers:
    1. Static SVG path grid — diagonal traces, nodes, right-angle turns
    2. CSS animated "pulse" dots that travel along select paths
  Opacity is kept very low so it adds depth without overwhelming.
  Light mode uses even lower opacity so parchment stays clean.
*/

export function CircuitBackground({ intensity = 1 }: { intensity?: number }) {
    // intensity: 1 = full (landing/login/dashboard), 0.5 = subtle (debate room), 0.75 = mid (new debate)
    const svgOpacity = intensity;
    const pulseVisible = intensity > 0.6;
    return (
        <div
            aria-hidden="true"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                overflow: "hidden",
            }}
        >
            {/* ── Vignette — darkens edges, spotlights centre ── */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(ellipse 70% 70% at 50% 40%, transparent 40%, rgba(0,0,0,0.45) 100%)",
                    zIndex: 2,
                }}
                className="vignette-layer"
            />

            {/* ── Circuit SVG ── */}
            <svg
                width="100%"
                height="100%"
                viewBox="0 0 1440 900"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid slice"
                className="circuit-svg"
                style={{ position: "absolute", inset: 0, zIndex: 1, opacity: svgOpacity }}
            >
                <defs>
                    {/* Gold trace gradient */}
                    <linearGradient id="gold-trace" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
                        <stop offset="30%" stopColor="#c9a84c" stopOpacity="0.5" />
                        <stop offset="70%" stopColor="#c9a84c" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
                    </linearGradient>
                    {/* Teal trace gradient */}
                    <linearGradient id="teal-trace" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00ffe0" stopOpacity="0" />
                        <stop offset="30%" stopColor="#00ffe0" stopOpacity="0.45" />
                        <stop offset="70%" stopColor="#00ffe0" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#00ffe0" stopOpacity="0" />
                    </linearGradient>
                    {/* Pulse dot filter */}
                    <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="glow-teal" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* ════════════════════════════════
            GOLD TRACES — main grid
        ════════════════════════════════ */}

                {/* Top-left diagonal cluster */}
                <path d="M-20 120 L180 120 L220 80 L420 80" fill="none" stroke="url(#gold-trace)" strokeWidth="0.6" opacity="0.7" />
                <path d="M0 200 L120 200 L160 160 L360 160 L400 120 L600 120" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.25" />
                <path d="M80 300 L200 300 L240 260 L500 260" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.2" />

                {/* Top-right cluster */}
                <path d="M1460 80 L1260 80 L1220 120 L1020 120" fill="none" stroke="url(#gold-trace)" strokeWidth="0.6" opacity="0.65" />
                <path d="M1440 180 L1300 180 L1260 220 L1100 220 L1060 180 L900 180" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.22" />
                <path d="M1380 320 L1200 320 L1160 280 L980 280" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.18" />

                {/* Bottom-left cluster */}
                <path d="M-20 780 L160 780 L200 740 L440 740" fill="none" stroke="url(#gold-trace)" strokeWidth="0.6" opacity="0.6" />
                <path d="M0 700 L140 700 L180 660 L380 660" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.2" />

                {/* Bottom-right cluster */}
                <path d="M1460 800 L1280 800 L1240 760 L1040 760" fill="none" stroke="url(#gold-trace)" strokeWidth="0.6" opacity="0.55" />
                <path d="M1440 700 L1300 700 L1260 660 L1080 660" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.18" />

                {/* Left spine — vertical with branches */}
                <path d="M60 0 L60 200 L100 240 L100 400 L60 440 L60 600 L100 640 L100 900" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.2" />
                <path d="M60 240 L-20 240" fill="none" stroke="#c9a84c" strokeWidth="0.4" opacity="0.15" />
                <path d="M60 440 L-20 440" fill="none" stroke="#c9a84c" strokeWidth="0.4" opacity="0.15" />

                {/* Right spine */}
                <path d="M1380 0 L1380 220 L1340 260 L1340 500 L1380 540 L1380 900" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.18" />

                {/* Mid horizontal connector */}
                <path d="M200 450 L360 450 L400 490 L560 490 L600 450 L780 450" fill="none" stroke="#c9a84c" strokeWidth="0.4" opacity="0.15" />
                <path d="M900 450 L1040 450 L1080 410 L1260 410" fill="none" stroke="#c9a84c" strokeWidth="0.4" opacity="0.15" />

                {/* ── Gold circuit nodes (intersection dots) ── */}
                {[
                    [180, 120], [220, 80], [420, 80],
                    [1260, 80], [1220, 120], [1020, 120],
                    [160, 780], [200, 740], [440, 740],
                    [1280, 800], [1240, 760], [1040, 760],
                    [100, 240], [100, 400], [100, 640],
                    [1340, 260], [1340, 500],
                    [360, 450], [400, 490], [560, 490], [600, 450],
                    [1040, 450], [1080, 410],
                ].map(([cx, cy], i) => (
                    <circle key={`gn-${i}`} cx={cx} cy={cy} r="2" fill="#c9a84c" opacity="0.45" />
                ))}

                {/* ════════════════════════════════
            TEAL TRACES — accent minority
        ════════════════════════════════ */}

                {/* Top-centre teal horizontal */}
                <path d="M500 40 L640 40 L680 80 L800 80 L840 40 L960 40" fill="none" stroke="url(#teal-trace)" strokeWidth="0.7" opacity="0.6" />

                {/* Left mid teal branch */}
                <path d="M0 360 L120 360 L160 400 L160 520 L120 560 L0 560" fill="none" stroke="#00ffe0" strokeWidth="0.5" opacity="0.2" />

                {/* Right mid teal branch */}
                <path d="M1440 380 L1320 380 L1280 420 L1280 500 L1320 540 L1440 540" fill="none" stroke="#00ffe0" strokeWidth="0.5" opacity="0.18" />

                {/* Bottom-centre teal */}
                <path d="M520 880 L640 880 L680 840 L780 840 L820 880 L940 880" fill="none" stroke="url(#teal-trace)" strokeWidth="0.6" opacity="0.5" />

                {/* Diagonal teal accent — top right to mid */}
                <path d="M1100 60 L980 180 L980 280" fill="none" stroke="#00ffe0" strokeWidth="0.5" opacity="0.2" />

                {/* ── Teal circuit nodes ── */}
                {[
                    [640, 40], [680, 80], [800, 80], [840, 40],
                    [160, 400], [160, 520],
                    [1280, 420], [1280, 500],
                    [680, 840], [780, 840],
                    [980, 180], [980, 280],
                ].map(([cx, cy], i) => (
                    <circle key={`tn-${i}`} cx={cx} cy={cy} r="1.75" fill="#00ffe0" opacity="0.4" />
                ))}

                {/* ════════════════════════════════
            ANIMATED PULSE DOTS
            Travel along key paths via CSS
        ════════════════════════════════ */}
                {pulseVisible && (<>
                    {/* Gold pulse 1 — top-left horizontal */}
                    <circle r="2.5" fill="#c9a84c" filter="url(#glow-gold)" opacity="0.8">
                        <animateMotion dur="8s" repeatCount="indefinite" begin="0s">
                            <mpath href="#pulse-path-1" />
                        </animateMotion>
                    </circle>

                    {/* Gold pulse 2 — top-right horizontal */}
                    <circle r="2.5" fill="#c9a84c" filter="url(#glow-gold)" opacity="0.8">
                        <animateMotion dur="10s" repeatCount="indefinite" begin="2s">
                            <mpath href="#pulse-path-2" />
                        </animateMotion>
                    </circle>

                    {/* Gold pulse 3 — bottom-left */}
                    <circle r="2" fill="#c9a84c" filter="url(#glow-gold)" opacity="0.7">
                        <animateMotion dur="12s" repeatCount="indefinite" begin="4s">
                            <mpath href="#pulse-path-3" />
                        </animateMotion>
                    </circle>

                    {/* Teal pulse 1 — top-centre */}
                    <circle r="2.5" fill="#00ffe0" filter="url(#glow-teal)" opacity="0.85">
                        <animateMotion dur="9s" repeatCount="indefinite" begin="1s">
                            <mpath href="#pulse-path-teal-1" />
                        </animateMotion>
                    </circle>

                    {/* Teal pulse 2 — bottom */}
                    <circle r="2" fill="#00ffe0" filter="url(#glow-teal)" opacity="0.75">
                        <animateMotion dur="11s" repeatCount="indefinite" begin="5s">
                            <mpath href="#pulse-path-teal-2" />
                        </animateMotion>
                    </circle>

                    {/* ── Motion paths (invisible, just for animateMotion) ── */}
                    <path id="pulse-path-1" d="M-20 120 L180 120 L220 80 L420 80" fill="none" stroke="none" />
                    <path id="pulse-path-2" d="M1460 80 L1260 80 L1220 120 L1020 120" fill="none" stroke="none" />
                    <path id="pulse-path-3" d="M-20 780 L160 780 L200 740 L440 740" fill="none" stroke="none" />
                    <path id="pulse-path-teal-1" d="M500 40 L640 40 L680 80 L800 80 L840 40 L960 40" fill="none" stroke="none" />
                    <path id="pulse-path-teal-2" d="M520 880 L640 880 L680 840 L780 840 L820 880 L940 880" fill="none" stroke="none" />
                </>)}
            </svg>

            <style>{`
        /* Light mode: reduce circuit opacity significantly for parchment */
        [data-theme="light"] .circuit-svg {
          opacity: 0.35;
        }
        [data-theme="light"] .vignette-layer {
          background: radial-gradient(ellipse 70% 70% at 50% 40%, transparent 40%, rgba(200,180,140,0.25) 100%);
        }
        /* Dark mode vignette already set via inline style */
        @media (prefers-reduced-motion: reduce) {
          .circuit-svg circle[fill="#c9a84c"],
          .circuit-svg circle[fill="#00ffe0"] {
            display: none;
          }
        }
      `}</style>
        </div>
    );
}