export default function AuthError() {
    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-void)",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem 1.5rem",
            }}
        >
            <div className="glass-card reveal-1" style={{ maxWidth: "400px", width: "100%", padding: "2.5rem 2rem", textAlign: "center", borderTop: "2px solid var(--red-neon)" }}>
                {/* Icon */}
                <div style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "center" }}>
                    <svg width="40" height="40" viewBox="0 0 28 28" fill="none" style={{ filter: "drop-shadow(0 0 10px rgba(255,68,68,0.3))" }}>
                        <polygon points="14,2 26,24 2,24" fill="none" stroke="var(--red-neon)" strokeWidth="1.25" strokeLinejoin="round" opacity="0.8" />
                        <line x1="14" y1="10" x2="14" y2="17" stroke="var(--red-neon)" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="14" cy="20" r="1" fill="var(--red-neon)" />
                    </svg>
                </div>

                <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.1em", color: "var(--red-neon)", marginBottom: "0.75rem" }}>
                    Authentication Failed
                </h1>
                <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "2rem" }}>
                    The Oracle could not verify your credentials. Please try again.
                </p>

                <div className="gold-rule-subtle" style={{ marginBottom: "1.5rem" }} />

                <a
                    href="/login"
                    className="btn-oracle"
                    style={{ display: "inline-flex", textDecoration: "none", justifyContent: "center" }}
                >
                    Return to Login →
                </a>
            </div>
        </div>
    );
}