"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface NavbarProps {
    /** The currently authenticated user's username, or null if logged out */
    username?: string | null;
    /** Hide the "Join debate" bar (e.g. on the debate room itself) */
    hideJoinBar?: boolean;
    /** Hide the sign-out button (e.g. on the landing / login page) */
    hideAuth?: boolean;
}

export function Navbar({ username, hideJoinBar, hideAuth }: NavbarProps) {
    const router = useRouter();
    const [joinLink, setJoinLink] = useState("");
    const [joinError, setJoinError] = useState("");
    const [joinExpanded, setJoinExpanded] = useState(false);

    const handleJoin = useCallback(() => {
        const raw = joinLink.trim();
        if (!raw) {
            setJoinError("Paste a debate link to continue.");
            return;
        }

        // Accept full URL or bare debate ID
        let debateId: string | null = null;

        try {
            const url = new URL(raw);
            // e.g. https://argos-indol.vercel.app/debate/abc-123
            const match = url.pathname.match(/\/debate\/([^/]+)/);
            if (match) debateId = match[1];
        } catch {
            // Not a full URL — try to match /debate/... or plain ID
            const pathMatch = raw.match(/\/debate\/([^/]+)/);
            if (pathMatch) {
                debateId = pathMatch[1];
            } else if (/^[a-zA-Z0-9_-]+$/.test(raw) && raw.length > 4) {
                debateId = raw;
            }
        }

        if (!debateId) {
            setJoinError("Could not parse a debate ID. Paste the full debate URL.");
            return;
        }

        setJoinError("");
        setJoinLink("");
        setJoinExpanded(false);
        router.push(`/debate/${debateId}`);
    }, [joinLink, router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleJoin();
        if (e.key === "Escape") {
            setJoinExpanded(false);
            setJoinError("");
            setJoinLink("");
        }
    };

    return (
        <header
            style={{
                position: "sticky",
                top: 0,
                zIndex: 100,
                background: "var(--bg-glass)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderBottom: "1px solid var(--border-default)",
            }}
        >
            {/* ── Main nav row ── */}
            <nav
                style={{
                    maxWidth: "1100px",
                    margin: "0 auto",
                    padding: "0 1.5rem",
                    height: "3.75rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                }}
            >
                {/* Wordmark */}
                <Link
                    href={username ? "/dashboard" : "/"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        textDecoration: "none",
                        flexShrink: 0,
                    }}
                >
                    {/* Oracle seal mark — triangle with inner glyph */}
                    <span
                        style={{
                            width: "1.75rem",
                            height: "1.75rem",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
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
                    </span>

                    <span
                        style={{
                            fontFamily: "var(--font-cinzel-deco), serif",
                            fontSize: "1.05rem",
                            fontWeight: 700,
                            letterSpacing: "0.18em",
                            color: "var(--text-primary)",
                        }}
                    >
                        ARGOS
                    </span>
                </Link>

                {/* ── Right side controls ── */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                    }}
                >
                    {/* Leaderboard link */}
                    <Link
                        href="/leaderboard"
                        style={{
                            fontFamily: "var(--font-cinzel), serif",
                            fontSize: "0.65rem",
                            letterSpacing: "0.14em",
                            color: "var(--text-secondary)",
                            textDecoration: "none",
                            padding: "0.45rem 0.5rem",
                            transition: "color 200ms ease",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-gold)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)")}
                    >
                        RANKS
                    </Link>

                    {/* Join debate — desktop inline icon-button */}
                    {!hideJoinBar && (
                        <button
                            onClick={() => setJoinExpanded((v) => !v)}
                            aria-label="Join a debate by link"
                            title="Join debate"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                background: "transparent",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-secondary)",
                                padding: "0.45rem 0.85rem",
                                cursor: "pointer",
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.65rem",
                                letterSpacing: "0.14em",
                                transition: "color 200ms ease, border-color 200ms ease, background 200ms ease",
                            }}
                            onMouseEnter={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.color = "var(--text-gold)";
                                el.style.borderColor = "var(--gold-border-hover)";
                                el.style.background = "var(--gold-glow)";
                            }}
                            onMouseLeave={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.color = "var(--text-secondary)";
                                el.style.borderColor = "var(--border-default)";
                                el.style.background = "transparent";
                            }}
                        >
                            {/* Portal/link icon */}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                            <span>JOIN</span>
                        </button>
                    )}

                    {/* Username display */}
                    {username && !hideAuth && (
                        <span
                            style={{
                                fontFamily: "var(--font-share-tech), monospace",
                                fontSize: "0.75rem",
                                letterSpacing: "0.08em",
                                color: "var(--text-tertiary)",
                                paddingLeft: "0.25rem",
                            }}
                        >
                            {username}
                        </span>
                    )}

                    {/* Sign out */}
                    {username && !hideAuth && (
                        <form action="/auth/signout" method="post">
                            <button
                                type="submit"
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--text-tertiary)",
                                    fontFamily: "var(--font-cinzel), serif",
                                    fontSize: "0.60rem",
                                    letterSpacing: "0.14em",
                                    cursor: "pointer",
                                    padding: "0.35rem 0.5rem",
                                    transition: "color 200ms ease",
                                }}
                                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)")}
                                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)")}
                            >
                                DEPART
                            </button>
                        </form>
                    )}

                    {/* Sign in — for logged-out state */}
                    {!username && !hideAuth && (
                        <Link
                            href="/login"
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.65rem",
                                letterSpacing: "0.14em",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-md)",
                                padding: "0.45rem 0.85rem",
                                textDecoration: "none",
                                transition: "color 200ms ease, border-color 200ms ease",
                                display: "inline-block",
                            }}
                            onMouseEnter={(e) => {
                                const el = e.currentTarget as HTMLAnchorElement;
                                el.style.color = "var(--text-gold)";
                                el.style.borderColor = "var(--gold-border-hover)";
                            }}
                            onMouseLeave={(e) => {
                                const el = e.currentTarget as HTMLAnchorElement;
                                el.style.color = "var(--text-secondary)";
                                el.style.borderColor = "var(--border-default)";
                            }}
                        >
                            ENTER
                        </Link>
                    )}
                </div>
            </nav>

            {/* ── Join debate expandable bar ── */}
            {!hideJoinBar && joinExpanded && (
                <div
                    style={{
                        borderTop: "1px solid var(--border-default)",
                        background: "var(--bg-surface)",
                        padding: "0.85rem 1.5rem",
                        animation: "oracle-fade-in 0.2s ease both",
                    }}
                >
                    <div
                        className="join-bar-row"
                        style={{
                            maxWidth: "1100px",
                            margin: "0 auto",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                        }}
                    >
                        {/* Label */}
                        <span
                            className="join-bar-label"
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.62rem",
                                letterSpacing: "0.18em",
                                color: "var(--text-gold)",
                                opacity: 0.7,
                                flexShrink: 0,
                                textTransform: "uppercase",
                            }}
                        >
                            Debate Link
                        </span>

                        {/* Input */}
                        <div style={{ flex: 1, position: "relative" }}>
                            <input
                                type="text"
                                value={joinLink}
                                onChange={(e) => {
                                    setJoinLink(e.target.value);
                                    if (joinError) setJoinError("");
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Paste a debate URL or ID to join…"
                                autoFocus
                                style={{
                                    width: "100%",
                                    background: "var(--bg-glass)",
                                    backdropFilter: "blur(8px)",
                                    border: `1px solid ${joinError ? "var(--red-neon)" : "var(--border-default)"}`,
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--text-primary)",
                                    fontFamily: "var(--font-share-tech), monospace",
                                    fontSize: "0.82rem",
                                    letterSpacing: "0.04em",
                                    padding: "0.55rem 1rem",
                                    outline: "none",
                                    transition: "border-color 200ms ease, box-shadow 200ms ease",
                                }}
                                onFocus={(e) => {
                                    if (!joinError) {
                                        (e.currentTarget as HTMLInputElement).style.borderColor = "var(--gold-border-hover)";
                                        (e.currentTarget as HTMLInputElement).style.boxShadow = "0 0 0 3px var(--gold-glow)";
                                    }
                                }}
                                onBlur={(e) => {
                                    if (!joinError) {
                                        (e.currentTarget as HTMLInputElement).style.borderColor = "var(--border-default)";
                                        (e.currentTarget as HTMLInputElement).style.boxShadow = "none";
                                    }
                                }}
                            />
                            {joinError && (
                                <p
                                    style={{
                                        position: "absolute",
                                        top: "calc(100% + 4px)",
                                        left: 0,
                                        fontFamily: "var(--font-share-tech), monospace",
                                        fontSize: "0.70rem",
                                        color: "var(--red-neon)",
                                        letterSpacing: "0.04em",
                                        pointerEvents: "none",
                                    }}
                                >
                                    {joinError}
                                </p>
                            )}
                        </div>

                        {/* Enter button */}
                        <button
                            onClick={handleJoin}
                            style={{
                                fontFamily: "var(--font-cinzel), serif",
                                fontSize: "0.65rem",
                                letterSpacing: "0.15em",
                                fontWeight: 600,
                                color: "var(--bg-void)",
                                background: "var(--gold)",
                                border: "1px solid var(--gold)",
                                borderRadius: "var(--radius-md)",
                                padding: "0.55rem 1.25rem",
                                cursor: "pointer",
                                flexShrink: 0,
                                transition: "background 150ms ease, box-shadow 150ms ease",
                                textTransform: "uppercase",
                            }}
                            onMouseEnter={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.background = "var(--gold-bright)";
                                el.style.boxShadow = "var(--shadow-gold-sm)";
                            }}
                            onMouseLeave={(e) => {
                                const el = e.currentTarget as HTMLButtonElement;
                                el.style.background = "var(--gold)";
                                el.style.boxShadow = "none";
                            }}
                        >
                            Enter →
                        </button>

                        {/* Dismiss */}
                        <button
                            onClick={() => {
                                setJoinExpanded(false);
                                setJoinError("");
                                setJoinLink("");
                            }}
                            aria-label="Close join bar"
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-tertiary)",
                                cursor: "pointer",
                                padding: "0.4rem",
                                display: "flex",
                                alignItems: "center",
                                transition: "color 150ms ease",
                                flexShrink: 0,
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)")}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
}