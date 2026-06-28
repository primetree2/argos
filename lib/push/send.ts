import { createClient as createServiceClient } from "@supabase/supabase-js";

// Web push sender (ROADMAP 2.4 item 3).
//
// FAIL-OPEN BY DESIGN, on every axis:
//   - `web-push` is dynamically imported so the build stays green even before
//     the package is installed (the import simply fails and we no-op).
//   - If the VAPID env vars are absent, we no-op (push is "not configured").
//   - If migration 0019 is absent, the subscription read errors and we no-op.
//   - A dead/expired subscription (404/410) is pruned; any other error is
//     swallowed. A failed push must NEVER break the action that triggered it.
//
// Returns the number of notifications actually delivered (0 when not configured).

export interface PushPayload {
    title: string;
    body?: string;
    /** In-app path to open on click, e.g. "/debate/<id>". */
    url?: string;
}

function vapidConfigured(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    );
}

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/**
 * Best-effort web push to every subscription a user has registered. Safe to
 * call fire-and-forget. No-ops (returns 0) when push isn't configured, the
 * package isn't installed, or the table doesn't exist yet.
 */
export async function sendPush(
    recipientId: string,
    payload: PushPayload
): Promise<number> {
    if (!recipientId || !vapidConfigured()) return 0;

    // Dynamically import web-push so a missing package can't break the build.
    let webpush: typeof import("web-push");
    try {
        webpush = await import("web-push");
    } catch {
        return 0; // package not installed yet — fail-open
    }

    try {
        const contact =
            process.env.VAPID_CONTACT_EMAIL
                ? `mailto:${process.env.VAPID_CONTACT_EMAIL}`
                : "mailto:notifications@argos-indol.vercel.app";
        webpush.setVapidDetails(
            contact,
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
            process.env.VAPID_PRIVATE_KEY!
        );

        const client = serviceClient();
        const { data: subs, error } = await client
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("user_id", recipientId);

        if (error || !subs || subs.length === 0) return 0;

        const body = JSON.stringify({
            title: payload.title,
            body: payload.body ?? "",
            url: payload.url ?? "/dashboard",
        });

        let sent = 0;
        await Promise.all(
            subs.map(async (s) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: s.endpoint as string,
                            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
                        },
                        body
                    );
                    sent += 1;
                } catch (err: unknown) {
                    // Prune dead subscriptions (gone / expired).
                    const statusCode =
                        typeof err === "object" && err !== null && "statusCode" in err
                            ? (err as { statusCode?: number }).statusCode
                            : undefined;
                    if (statusCode === 404 || statusCode === 410) {
                        try {
                            await client.from("push_subscriptions").delete().eq("id", s.id);
                        } catch {
                            /* fail-open */
                        }
                    }
                }
            })
        );

        return sent;
    } catch {
        return 0; // fail-open
    }
}
