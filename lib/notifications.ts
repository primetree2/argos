import type { SupabaseClient } from "@supabase/supabase-js";

// In-app notifications (ROADMAP 2.4 item 2).
//
// A deliberately tiny helper around the `notifications` table (migration 0018).
// FAIL-OPEN by design: if the table doesn't exist yet (pre-0018) or the insert
// errors for any reason, we swallow it and return null. A notification is a
// nicety — it must NEVER break the action that triggered it (e.g. accepting a
// challenge). Inserts are expected to use the service-role client so they
// bypass RLS (end users only read/update their own rows).

export interface NewNotification {
    recipientId: string;
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
}

export async function createNotification(
    client: SupabaseClient,
    n: NewNotification
): Promise<string | null> {
    try {
        const { data, error } = await client
            .from("notifications")
            .insert({
                recipient_id: n.recipientId,
                type: n.type,
                title: n.title,
                body: n.body ?? null,
                link: n.link ?? null,
            })
            .select("id")
            .single();
        if (error) return null; // fail-open (table missing / transient)
        return (data?.id as string) ?? null;
    } catch {
        return null;
    }
}
