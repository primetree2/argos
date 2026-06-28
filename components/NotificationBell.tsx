"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// In-app notification bell (ROADMAP 2.4 item 2). Logged-in only.
//
// FAIL-OPEN: if the `notifications` table doesn't exist yet (pre-0018) the
// initial fetch errors and we just render an empty bell — nothing breaks.

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    read: boolean;
    created_at: string;
}

export function NotificationBell() {
    const router = useRouter();
    const supabase = createClient();
    const [userId, setUserId] = useState<string | null>(null);
    const [items, setItems] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const unread = items.filter((n) => !n.read).length;

    // Resolve the current user's id ourselves so the Navbar doesn't need to
    // thread a userId prop through every page.
    useEffect(() => {
        let active = true;
        (async () => {
            const { data } = await supabase.auth.getUser();
            if (active) setUserId(data.user?.id ?? null);
        })();
        return () => { active = false; };
    }, [supabase]);

    // Initial load (fail-open: a missing table just yields no items).
    useEffect(() => {
        if (!userId) return;
        let active = true;
        (async () => {
            const { data, error } = await supabase
                .from("notifications")
                .select("id, type, title, body, link, read, created_at")
                .eq("recipient_id", userId)
                .order("created_at", { ascending: false })
                .limit(15);
            if (!active || error || !data) return;
            setItems(data as Notification[]);
        })();
        return () => { active = false; };
    }, [supabase, userId]);

    // Realtime: prepend new notifications for this user as they arrive.
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`notifications:${userId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
                (payload) => {
                    const n = payload.new as Notification;
                    setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 15)));
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [supabase, userId]);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // Mark all unread as read when the panel opens (fail-open).
    const markAllRead = useCallback(async () => {
        const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
        if (unreadIds.length === 0) return;
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        try {
            await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
        } catch { /* fail-open */ }
    }, [items, supabase]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) void markAllRead();
    };

    const go = (n: Notification) => {
        setOpen(false);
        if (n.link) router.push(n.link);
    };

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text-secondary)",
                    padding: "0.45rem 0.55rem",
                    cursor: "pointer",
                    transition: "color 200ms ease, border-color 200ms ease",
                }}
                onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.color = "var(--text-gold)";
                    el.style.borderColor = "var(--gold-border-hover)";
                }}
                onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.color = "var(--text-secondary)";
                    el.style.borderColor = "var(--border-default)";
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                    <span
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: "-4px",
                            right: "-4px",
                            minWidth: "15px",
                            height: "15px",
                            padding: "0 3px",
                            borderRadius: "8px",
                            background: "var(--gold)",
                            color: "var(--bg-void)",
                            fontFamily: "var(--font-share-tech), monospace",
                            fontSize: "0.55rem",
                            lineHeight: "15px",
                            textAlign: "center",
                            boxShadow: "0 0 8px rgba(201,168,76,0.5)",
                        }}
                    >
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 0.5rem)",
                        right: 0,
                        width: "min(20rem, 80vw)",
                        maxHeight: "22rem",
                        overflowY: "auto",
                        background: "var(--bg-glass)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid var(--gold-border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-card)",
                        zIndex: 200,
                        padding: "0.5rem",
                        animation: "oracle-fade-in 0.18s ease both",
                    }}
                >
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.2em", color: "var(--text-gold)", textTransform: "uppercase", padding: "0.4rem 0.6rem 0.5rem" }}>
                        Notifications
                    </p>
                    {items.length === 0 ? (
                        <p style={{ fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.85rem", color: "var(--text-tertiary)", padding: "0.85rem 0.6rem", textAlign: "center" }}>
                            Nothing yet. Post a challenge and the Oracle will tell you when someone joins.
                        </p>
                    ) : (
                        items.map((n) => (
                            <button
                                key={n.id}
                                onClick={() => go(n)}
                                role="menuitem"
                                style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    background: n.read ? "transparent" : "var(--gold-glow)",
                                    border: "1px solid var(--border-default)",
                                    borderRadius: "var(--radius-sm)",
                                    padding: "0.6rem 0.7rem",
                                    marginBottom: "0.4rem",
                                    cursor: n.link ? "pointer" : "default",
                                    transition: "background 150ms ease, border-color 150ms ease",
                                }}
                            >
                                <span style={{ display: "block", fontFamily: "var(--font-cinzel), serif", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: n.body ? "0.2rem" : 0 }}>
                                    {n.title}
                                </span>
                                {n.body && (
                                    <span style={{ display: "block", fontFamily: "var(--font-crimson), serif", fontStyle: "italic", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                                        {n.body}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
