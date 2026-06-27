"use client";

import { useState } from "react";

// Block control (ROADMAP Phase 1, item 4). Shown on another user's profile.
// Toggles /api/blocks. Matchmaking already excludes mutually-blocked users
// (match_player, migration 0007). Styled with Oracle Terminal tokens.

export function BlockButton({
    targetUserId,
    initialBlocked,
}: {
    targetUserId: string;
    initialBlocked: boolean;
}) {
    const [blocked, setBlocked] = useState(initialBlocked);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    const toggle = async () => {
        if (pending) return;
        setPending(true);
        setError("");
        const next = !blocked;
        try {
            const res = await fetch("/api/blocks", {
                method: next ? "POST" : "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blockedUserId: targetUserId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Failed.");
            }
            setBlocked(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed.");
        } finally {
            setPending(false);
        }
    };

    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
            <button
                onClick={toggle}
                disabled={pending}
                style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.6rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    padding: "0.5rem 0.9rem",
                    borderRadius: "var(--radius-md)",
                    background: "transparent",
                    border: `1px solid ${blocked ? "var(--gold-border-hover)" : "var(--red-border)"}`,
                    color: blocked ? "var(--text-gold)" : "var(--red-neon)",
                    cursor: "pointer",
                    transition: "all 200ms ease",
                    opacity: pending ? 0.6 : 1,
                }}
            >
                {blocked ? "Unblock" : "Block"}
            </button>
            {error && (
                <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.62rem", color: "var(--red-neon)" }}>
                    {error}
                </span>
            )}
        </div>
    );
}
