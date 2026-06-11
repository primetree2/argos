import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/LoginButton";
import { CircuitBackground } from "@/components/CircuitBackground";

export default async function LoginPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");

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
                padding: "2rem 1.5rem",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <CircuitBackground />
            {/* ── Atmospheric corner rays ── */}
            <div
                aria-hidden="true"
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            >
                {/* Top centre glow */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "600px",
                        height: "400px",
                        background:
                            "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 70%)",
                    }}
                />
                {/* Bottom teal hint */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 0,
                        right: "10%",
                        width: "400px",
                        height: "300px",
                        background:
                            "radial-gradient(ellipse at 80% 100%, rgba(0,255,224,0.04) 0%, transparent 70%)",
                    }}
                />
            </div>

            {/* ── Oracle Seal SVG ── */}
            <div
                className="reveal-1"
                style={{
                    position: "relative",
                    zIndex: 1,
                    marginBottom: "2rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1rem",
                }}
            >
                <OracleSeal />

                {/* Wordmark under the seal */}
                <div style={{ textAlign: "center" }}>
                    <div
                        style={{
                            fontFamily: "var(--font-cinzel-deco), serif",
                            fontSize: "1.6rem",
                            fontWeight: 900,
                            letterSpacing: "0.22em",
                            color: "var(--text-primary)",
                            lineHeight: 1,
                        }}
                    >
                        ARGOS
                    </div>
                    <p
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "0.6rem",
                            letterSpacing: "0.28em",
                            color: "var(--text-gold)",
                            opacity: 1,
                            textTransform: "uppercase",
                            marginTop: "0.4rem",
                        }}
                    >
                        The Oracle Debate Arena
                    </p>
                </div>
            </div>

            {/* ── Card ── */}
            <div
                className="reveal-2"
                style={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    maxWidth: "400px",
                }}
            >
                {/* Gold rule above card */}
                <div className="gold-rule" style={{ marginBottom: "0" }} />

                <div
                    style={{
                        background: "var(--bg-glass)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid var(--gold-border)",
                        borderTop: "none",
                        borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
                        padding: "2.5rem 2rem",
                        boxShadow: "var(--shadow-card), var(--shadow-gold)",
                    }}
                >
                    {/* Card heading */}
                    <div style={{ marginBottom: "2rem", textAlign: "center" }}>
                        <h1
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "1rem",
                                fontWeight: 600,
                                letterSpacing: "0.12em",
                                color: "var(--text-primary)",
                                marginBottom: "0.6rem",
                            }}
                        >
                            Present Your Credentials
                        </h1>
                        <p
                            style={{
                                fontFamily: "var(--font-crimson), serif",
                                fontSize: "0.95rem",
                                fontStyle: "italic",
                                color: "var(--text-secondary)",
                                lineHeight: 1.6,
                            }}
                        >
                            Your Elo rating and debate record are bound to your account.
                        </p>
                    </div>

                    {/* Subtle divider */}
                    <div className="gold-rule-subtle" style={{ marginBottom: "2rem" }} />

                    {/* Login button */}
                    <LoginButton />

                    {/* Fine print */}
                    <p
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "0.58rem",
                            letterSpacing: "0.14em",
                            color: "var(--text-tertiary)",
                            textAlign: "center",
                            marginTop: "1.75rem",
                            lineHeight: 1.7,
                        }}
                    >
                        By entering, you agree to argue in good faith.
                        <br />
                        <span style={{ opacity: 0.6 }}>
                            The Oracle records everything.
                        </span>
                    </p>
                </div>
            </div>

            {/* ── Latin footer inscription ── */}
            <div
                className="reveal-3"
                style={{
                    position: "relative",
                    zIndex: 1,
                    marginTop: "2.5rem",
                    textAlign: "center",
                }}
            >
                <p
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "0.58rem",
                        letterSpacing: "0.25em",
                        color: "var(--text-tertiary)",
                        opacity: 0.95,
                        textTransform: "uppercase",
                    }}
                >
                    Audi alteram partem
                </p>
                <p
                    style={{
                        fontFamily: "var(--font-crimson), serif",
                        fontSize: "0.75rem",
                        fontStyle: "italic",
                        color: "var(--text-tertiary)",
                        opacity: 0.9,
                        marginTop: "0.25rem",
                    }}
                >
                    Hear the other side
                </p>
            </div>
        </div>
    );
}

/* ── Oracle Seal — decorative SVG emblem ── */
function OracleSeal() {
    return (
        <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                animation: "oracle-fade-in 1.2s ease both",
                filter: "drop-shadow(0 0 18px rgba(201,168,76,0.22))",
            }}
        >
            {/* Outer ring */}
            <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="0.75"
                strokeDasharray="3 5"
                opacity="0.4"
            />
            {/* Inner ring */}
            <circle
                cx="48"
                cy="48"
                r="38"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="0.5"
                opacity="0.25"
            />
            {/* Outer triangle */}
            <polygon
                points="48,10 82,68 14,68"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.25"
                strokeLinejoin="round"
                opacity="0.85"
            />
            {/* Inner triangle (inverted — Star of insight) */}
            <polygon
                points="48,28 68,62 28,62"
                fill="var(--gold-glow)"
                stroke="var(--gold)"
                strokeWidth="0.75"
                strokeLinejoin="round"
                opacity="0.6"
            />
            {/* Laurel left */}
            <path
                d="M22 72 Q18 68 20 63 Q24 65 22 72Z"
                fill="var(--gold)"
                opacity="0.35"
            />
            <path
                d="M18 76 Q14 71 17 66 Q21 69 18 76Z"
                fill="var(--gold)"
                opacity="0.25"
            />
            <path
                d="M26 75 Q22 72 23 66 Q27 68 26 75Z"
                fill="var(--gold)"
                opacity="0.3"
            />
            {/* Laurel right */}
            <path
                d="M74 72 Q78 68 76 63 Q72 65 74 72Z"
                fill="var(--gold)"
                opacity="0.35"
            />
            <path
                d="M78 76 Q82 71 79 66 Q75 69 78 76Z"
                fill="var(--gold)"
                opacity="0.25"
            />
            <path
                d="M70 75 Q74 72 73 66 Q69 68 70 75Z"
                fill="var(--gold)"
                opacity="0.3"
            />
            {/* Centre eye / all-seeing point */}
            <circle cx="48" cy="46" r="4" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.7" />
            <circle cx="48" cy="46" r="1.5" fill="var(--gold)" opacity="0.9" />
            {/* Horizontal rule through centre */}
            <line x1="32" y1="46" x2="40" y2="46" stroke="var(--gold)" strokeWidth="0.5" opacity="0.4" />
            <line x1="56" y1="46" x2="64" y2="46" stroke="var(--gold)" strokeWidth="0.5" opacity="0.4" />
            {/* Bottom label arc — text rendered as straight line for simplicity */}
            <text
                x="48"
                y="86"
                textAnchor="middle"
                fontFamily="'Cinzel', serif"
                fontSize="5"
                letterSpacing="3"
                fill="var(--gold)"
                opacity="0.45"
            >
                VERITAS
            </text>
        </svg>
    );
}