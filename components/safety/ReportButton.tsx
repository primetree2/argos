"use client";

import { useState } from "react";

// Report control (ROADMAP Phase 1, item 4). A minimal inline reporter shown on
// an opponent's argument. Opens a small reason picker, posts to /api/reports,
// then shows a confirmed state. Styled with the Oracle Terminal tokens.

const REASONS: { value: string; label: string }[] = [
    { value: "harassment", label: "Harassment" },
    { value: "hate", label: "Hate speech" },
    { value: "spam", label: "Spam" },
    { value: "other", label: "Other" },
];

export function ReportButton({
    argumentId,
    reportedUserId,
}: {
    argumentId?: string;
    reportedUserId?: string;
}) {
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    const submit = async (reason: string) => {
        if (pending) return;
        setPending(true);
        setError("");
        try {
            const res = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ argumentId, reportedUserId, reason }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Failed to report.");
            }
            setDone(true);
            setOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to report.");
        } finally {
            setPending(false);
        }
    };

    const chip = (label: string, onClick: () => void, danger = false) => (
        <button
            onClick={onClick}
            disabled={pending}
            style={{
                fontFamily: "var(--font-share-tech), monospace",
                fontSize: "0.62rem",
                letterSpacing: "0.08em",
                padding: "0.3rem 0.6rem",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${danger ? "var(--red-border)" : "var(--border-default)"}`,
                background: "transparent",
                color: danger ? "var(--red-neon)" : "var(--text-tertiary)",
                cursor: "pointer",
                transition: "color 150ms ease, border-color 150ms ease",
            }}
        >
            {label}
        </button>
    );

    if (done) {
        return (
            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                ◆ Reported — thank you
            </span>
        );
    }

    if (!open) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {chip("⚑ Report", () => setOpen(true))}
                {error && (
                    <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", color: "var(--red-neon)" }}>
                        {error}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.6rem", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginRight: "0.2rem" }}>
                Reason:
            </span>
            {REASONS.map((r) => chip(r.label, () => submit(r.value)))}
            {chip("Cancel", () => setOpen(false), true)}
        </div>
    );
}
