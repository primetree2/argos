"use client";

import { useState, useEffect, useCallback } from "react";

// Argument reactions strip (#7). Shown under each argument on completed public
// debates. Optimistic toggle; counts loaded once per debate by the parent and
// passed in, then updated locally.

export const REACTIONS: { type: string; emoji: string; label: string }[] = [
    { type: "strong", emoji: "\u{1F4A1}", label: "Strong point" },
    { type: "brutal", emoji: "\u{1F525}", label: "Brutal rebuttal" },
    { type: "questionable", emoji: "\u26A0\uFE0F", label: "Questionable claim" },
];

export function ArgumentReactions({
    argumentId,
    initialCounts,
    initialMine,
    canReact,
}: {
    argumentId: string;
    initialCounts: Record<string, number>;
    initialMine: string | null;
    canReact: boolean;
}) {
    const [counts, setCounts] = useState<Record<string, number>>(initialCounts ?? {});
    const [mine, setMine] = useState<string | null>(initialMine);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        setCounts(initialCounts ?? {});
        setMine(initialMine);
    }, [initialCounts, initialMine]);

    const toggle = useCallback(
        async (type: string) => {
            if (!canReact || pending) return;
            setPending(true);

            // Optimistic update.
            const prevCounts = counts;
            const prevMine = mine;
            const next = { ...counts };
            if (mine === type) {
                next[type] = Math.max(0, (next[type] ?? 1) - 1);
                setMine(null);
            } else {
                if (mine) next[mine] = Math.max(0, (next[mine] ?? 1) - 1);
                next[type] = (next[type] ?? 0) + 1;
                setMine(type);
            }
            setCounts(next);

            try {
                const res = await fetch("/api/reactions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ argumentId, reactionType: type }),
                });
                if (!res.ok) throw new Error("failed");
            } catch {
                // Roll back on failure.
                setCounts(prevCounts);
                setMine(prevMine);
            } finally {
                setPending(false);
            }
        },
        [argumentId, canReact, counts, mine, pending]
    );

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.85rem" }}>
            {REACTIONS.map((r) => {
                const count = counts[r.type] ?? 0;
                const active = mine === r.type;
                return (
                    <button
                        key={r.type}
                        onClick={() => toggle(r.type)}
                        disabled={!canReact || pending}
                        title={canReact ? r.label : "Sign in to react"}
                        aria-pressed={active}
                        className="reaction-chip"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontFamily: "var(--font-share-tech), monospace",
                            fontSize: "0.72rem",
                            letterSpacing: "0.04em",
                            padding: "0.35rem 0.7rem",
                            borderRadius: "var(--radius-sm)",
                            border: `1px solid ${active ? "var(--gold-border-hover)" : "var(--border-default)"}`,
                            background: active ? "var(--gold-glow)" : "transparent",
                            color: active ? "var(--text-gold)" : "var(--text-tertiary)",
                            cursor: canReact ? "pointer" : "default",
                            transition: "border-color 150ms ease, background 150ms ease, color 150ms ease",
                        }}
                    >
                        <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{r.emoji}</span>
                        <span>{count}</span>
                    </button>
                );
            })}
        </div>
    );
}
