"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
    const { theme, toggle } = useTheme();
    const isDark = theme === "dark";

    return (
        <button
            onClick={toggle}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light mode" : "Dark mode"}
            style={{
                position: "fixed",
                bottom: "1.5rem",
                right: "1.5rem",
                zIndex: 9999,
                width: "2.75rem",
                height: "2.75rem",
                borderRadius: "50%",
                background: "var(--bg-glass)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid var(--gold-border)",
                color: "var(--text-gold)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "border-color 250ms ease, box-shadow 250ms ease, transform 150ms ease",
                boxShadow: "0 2px 16px rgba(0,0,0,0.30)",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-gold-sm)";
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold-border)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.30)";
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
        >
            {isDark ? (
                /* Sun icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
            ) : (
                /* Moon icon */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            )}
        </button>
    );
}