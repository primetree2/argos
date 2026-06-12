import Link from "next/link";
import { CircuitBackground } from "@/components/CircuitBackground";

export default function NotFound() {
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
                textAlign: "center",
            }}
        >
            <CircuitBackground intensity={0.7} />
            <div
                className="reveal-1"
                style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                {/* Dimmed, broken seal */}
                <svg
                    width="64"
                    height="64"
                    viewBox="0 0 28 28"
                    fill="none"
                    style={{ opacity: 0.5, marginBottom: "1.5rem" }}
                    aria-hidden="true"
                >
                    <polygon
                        points="14,2 26,24 2,24"
                        fill="none"
                        stroke="var(--gold)"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                        strokeDasharray="4 3"
                    />
                    <line
                        x1="9"
                        y1="15"
                        x2="19"
                        y2="15"
                        stroke="var(--gold)"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                </svg>

                <p className="label-oracle" style={{ marginBottom: "0.75rem" }}>
                    404 · Record Not Found
                </p>

                <h1
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        marginBottom: "0.75rem",
                    }}
                >
                    The Oracle Finds No Record
                </h1>

                <p
                    style={{
                        fontFamily: "var(--font-crimson), serif",
                        fontStyle: "italic",
                        color: "var(--text-secondary)",
                        fontSize: "1rem",
                        maxWidth: "420px",
                        lineHeight: 1.7,
                        marginBottom: "2.25rem",
                    }}
                >
                    The page you seek does not exist, or has been struck from the archive.
                </p>

                <Link href="/" className="btn-oracle" style={{ textDecoration: "none" }}>
                    Return to the Arena →
                </Link>
            </div>
        </div>
    );
}