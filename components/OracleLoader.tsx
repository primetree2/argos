/*
  OracleLoader
  ────────────
  Full-viewport loading state used by route-level loading.tsx files.
  Server-component safe — pure CSS animation, no hooks or handlers.
  Reuses design-system pieces: oracle-pulse keyframe, label-oracle,
  cursor-blink (all defined in app/globals.css).
*/

export function OracleLoader({ label = "Consulting the Oracle" }: { label?: string }) {
    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-void)",
                color: "var(--text-primary)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.5rem",
            }}
        >
            {/* Oracle seal — same mark as the Navbar wordmark, pulsing */}
            <svg
                width="56"
                height="56"
                viewBox="0 0 28 28"
                fill="none"
                className="oracle-loader-seal"
                aria-hidden="true"
            >
                <polygon
                    points="14,2 26,24 2,24"
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />
                <polygon
                    points="14,8 21,21 7,21"
                    fill="var(--gold-glow)"
                    stroke="var(--gold-dim)"
                    strokeWidth="0.75"
                    strokeLinejoin="round"
                />
                <circle cx="14" cy="15" r="1.5" fill="var(--gold)" />
            </svg>

            <p className="label-oracle cursor-blink" role="status">
                {label}
            </p>

            <style>{`
        .oracle-loader-seal {
          animation: oracle-pulse 1.8s ease-in-out infinite;
          filter: drop-shadow(0 0 12px var(--gold-glow-strong));
        }
      `}</style>
        </div>
    );
}
