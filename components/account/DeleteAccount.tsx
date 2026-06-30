"use client";

import { useState } from "react";

// Must match the server gate (app/api/account/route.ts).
const CONFIRM_PHRASE = "DELETE";

export function DeleteAccount() {
    const [armed, setArmed] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");

    const phraseOk = confirm.trim().toUpperCase() === CONFIRM_PHRASE;

    const handleDelete = async () => {
        if (!phraseOk || deleting) return;
        setDeleting(true);
        setError("");
        try {
            const res = await fetch("/api/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: confirm.trim() }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Could not delete your account. Try again.");
                setDeleting(false);
                return;
            }
            // Account + session are gone — leave the app.
            window.location.href = "/";
        } catch {
            setError("The Oracle is unreachable. Try again.");
            setDeleting(false);
        }
    };

    return (
        <div
            className="glass-card"
            style={{
                padding: "1.5rem",
                borderTop: "1px solid var(--red-neon)",
                background: "var(--red-glow)",
            }}
        >
            <p
                style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "0.6rem",
                    letterSpacing: "0.22em",
                    color: "var(--red-neon)",
                    textTransform: "uppercase",
                    marginBottom: "0.6rem",
                }}
            >
                ◆ Danger Zone
            </p>
            <h2
                style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    color: "var(--text-primary)",
                    marginBottom: "0.5rem",
                }}
            >
                Delete Account
            </h2>
            <p
                style={{
                    fontFamily: "var(--font-crimson), serif",
                    fontSize: "0.95rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: "1.1rem",
                }}
            >
                This permanently erases your profile, Elo rating and history, your
                arguments, votes, reactions, challenges and notifications. Debates you took
                part in are kept for your opponents but anonymized — your name is replaced
                with “Departed Orator.” <strong style={{ color: "var(--text-primary)" }}>This
                cannot be undone.</strong>
            </p>

            {!armed ? (
                <button
                    onClick={() => { setArmed(true); setError(""); }}
                    style={dangerBtn}
                >
                    Delete my account
                </button>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <label
                        style={{
                            fontFamily: "var(--font-share-tech), monospace",
                            fontSize: "0.72rem",
                            letterSpacing: "0.06em",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Type <span style={{ color: "var(--red-neon)", fontWeight: 700 }}>{CONFIRM_PHRASE}</span> to confirm:
                    </label>
                    <input
                        type="text"
                        value={confirm}
                        onChange={(e) => { setConfirm(e.target.value); if (error) setError(""); }}
                        placeholder={CONFIRM_PHRASE}
                        autoFocus
                        className="oracle-input"
                        style={{ maxWidth: "16rem" }}
                    />

                    {error && (
                        <p
                            style={{
                                fontFamily: "var(--font-share-tech), monospace",
                                fontSize: "0.72rem",
                                color: "var(--red-neon)",
                                letterSpacing: "0.04em",
                            }}
                        >
                            ⚠ {error}
                        </p>
                    )}

                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                        <button
                            onClick={handleDelete}
                            disabled={!phraseOk || deleting}
                            style={{
                                ...dangerBtn,
                                opacity: !phraseOk || deleting ? 0.5 : 1,
                                cursor: !phraseOk || deleting ? "not-allowed" : "pointer",
                            }}
                        >
                            {deleting ? (
                                <><span style={{ animation: "oracle-pulse 1s ease-in-out infinite" }}>◆</span>&nbsp;Deleting…</>
                            ) : (
                                "Permanently delete"
                            )}
                        </button>
                        <button
                            onClick={() => { setArmed(false); setConfirm(""); setError(""); }}
                            disabled={deleting}
                            className="btn-ghost"
                            style={{ fontSize: "0.7rem", letterSpacing: "0.14em", padding: "0.7rem 1.25rem" }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const dangerBtn: React.CSSProperties = {
    fontFamily: "var(--font-cinzel), serif",
    fontSize: "0.7rem",
    letterSpacing: "0.16em",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#fff",
    background: "var(--red-neon)",
    border: "1px solid var(--red-neon)",
    borderRadius: "var(--radius-md)",
    padding: "0.75rem 1.4rem",
    cursor: "pointer",
    transition: "opacity 150ms ease, box-shadow 150ms ease",
};
