"use client";

import { useCallback, useEffect, useState } from "react";

// Web push opt-in control (ROADMAP 2.4 item 3). Logged-in only; mounted in the
// Navbar. FAIL-SAFE throughout:
//   - Renders NOTHING if the browser lacks SW/Push support, or if the VAPID
//     public key isn't configured (so it's invisible until push is set up).
//   - Registers /sw.js and reflects the current subscription state.
//   - All network/permission errors are swallowed into a soft inline message;
//     they never throw.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function PushManager() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const [supported, setSupported] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [isIOSNonStandalone, setIsIOSNonStandalone] = useState(false);
    const [hint, setHint] = useState("");

    // Detect support + register the service worker + read current state.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasSupport =
            "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        if (!hasSupport) return;
        setSupported(true);

        // iOS only allows web push when installed to the home screen.
        const ua = navigator.userAgent;
        const iOS = /iPad|iPhone|iPod/.test(ua);
        const standalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            // @ts-expect-error legacy iOS Safari flag
            window.navigator.standalone === true;
        setIsIOSNonStandalone(iOS && !standalone);

        let active = true;
        (async () => {
            try {
                const reg = await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                    updateViaCache: "none",
                });
                const sub = await reg.pushManager.getSubscription();
                if (active) setSubscribed(Boolean(sub));
            } catch {
                /* fail-safe */
            }
        })();
        return () => { active = false; };
    }, []);

    const subscribe = useCallback(async () => {
        if (!vapidKey) return;
        setBusy(true);
        setHint("");
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setHint("Notifications blocked. Enable them in your browser settings.");
                setBusy(false);
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
            });
            const res = await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
            });
            if (res.ok) setSubscribed(true);
            else setHint("Could not save your subscription. Try again.");
        } catch {
            setHint("Could not enable notifications. Try again.");
        }
        setBusy(false);
    }, [vapidKey]);

    const unsubscribe = useCallback(async () => {
        setBusy(true);
        setHint("");
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            const endpoint = sub?.endpoint ?? null;
            await sub?.unsubscribe();
            await fetch("/api/push/unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint }),
            });
            setSubscribed(false);
        } catch {
            setHint("Could not turn off notifications. Try again.");
        }
        setBusy(false);
    }, []);

    // Invisible until push is actually configured + supported.
    if (!supported || !vapidKey) return null;

    const baseBtn: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        color: subscribed ? "var(--text-gold)" : "var(--text-secondary)",
        padding: "0.45rem 0.55rem",
        cursor: busy ? "wait" : "pointer",
        transition: "color 200ms ease, border-color 200ms ease",
    };

    return (
        <div style={{ position: "relative" }}>
            <button
                type="button"
                aria-label={subscribed ? "Disable push notifications" : "Enable push notifications"}
                aria-pressed={subscribed}
                title={
                    isIOSNonStandalone
                        ? "Add Argos to your Home Screen first to enable push on iOS"
                        : subscribed
                            ? "Push notifications on — click to turn off"
                            : "Get notified when someone joins your challenge or it's your turn"
                }
                disabled={busy}
                onClick={subscribed ? unsubscribe : subscribe}
                style={{ ...baseBtn, borderColor: subscribed ? "var(--gold-border)" : "var(--border-default)" }}
                onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.color = "var(--text-gold)";
                    el.style.borderColor = "var(--gold-border-hover)";
                }}
                onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.color = subscribed ? "var(--text-gold)" : "var(--text-secondary)";
                    el.style.borderColor = subscribed ? "var(--gold-border)" : "var(--border-default)";
                }}
            >
                {subscribed ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8.7 3A6 6 0 0 1 18 8c0 7 3 9 3 9H7" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                )}
            </button>
            {hint && (
                <span
                    role="status"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 0.4rem)",
                        right: 0,
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-share-tech), monospace",
                        fontSize: "0.58rem",
                        letterSpacing: "0.04em",
                        color: "var(--text-tertiary)",
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.3rem 0.5rem",
                        zIndex: 200,
                    }}
                >
                    {hint}
                </span>
            )}
        </div>
    );
}
