"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { CircuitBackground } from "@/components/CircuitBackground";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

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
                className="reveal-1 glass-card"
                style={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: "440px",
                    width: "100%",
                    padding: "2.5rem 2rem",
                    borderTop: "1px solid var(--red-border)",
                }}
            >
                {/* Warning triangle */}
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 28 28"
                    fill="none"
                    style={{ marginBottom: "1.25rem" }}
                    aria-hidden="true"
                >
                    <polygon
                        points="14,3 26,24 2,24"
                        fill="var(--red-glow)"
                        stroke="var(--red-neon)"
                        strokeWidth="1.25"
                        strokeLinejoin="round"
                    />
                    <line
                        x1="14"
                        y1="11"
                        x2="14"
                        y2="17"
                        stroke="var(--red-neon)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                    <circle cx="14" cy="20.5" r="1" fill="var(--red-neon)" />
                </svg>

                <p
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "0.6rem",
                        letterSpacing: "0.24em",
                        color: "var(--red-neon)",
                        textTransform: "uppercase",
                        marginBottom: "0.75rem",
                    }}
                >
                    Disturbance Detected
                </p>

                <h1
                    style={{
                        fontFamily: "var(--font-cinzel), serif",
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        marginBottom: "0.75rem",
                    }}
                >
                    The Oracle Faltered
                </h1>

                <p
                    style={{
                        fontFamily: "var(--font-crimson), serif",
                        fontStyle: "italic",
                        color: "var(--text-secondary)",
                        fontSize: "0.95rem",
                        lineHeight: 1.7,
                        marginBottom: "2rem",
                    }}
                >
                    An unexpected disturbance interrupted the proceedings. The incident has been recorded.
                </p>

                <div
                    className="result-actions"
                    style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <button onClick={reset} className="btn-oracle">
                        Try Again
                    </button>
                    <Link href="/dashboard" className="btn-ghost" style={{ textDecoration: "none" }}>
                        Return to Arena
                    </Link>
                </div>
            </div>
        </div>
    );
}