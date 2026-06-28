import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ORACLE_USER_ID } from "@/lib/ai/oracle";

// Connection email notifications.
// Self-contained + fail-safe: if RESEND_API_KEY is unset, every send no-ops so
// gameplay is never blocked in dev/preview. All errors are swallowed and
// logged — a failed email must never break gameplay. Argos sends exactly ONE
// gameplay email: a "you're connected for a debate" note to both players when
// they are matched or a challenge is accepted (sendMatchNotification).
// Per-turn emails were removed (sendTurnNotification is now an inert no-op).

const FROM = process.env.RESEND_FROM_EMAIL ?? "Argos <notifications@argos-indol.vercel.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://argos-indol.vercel.app";

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Email BOTH human players once when they are connected for a debate — i.e.
 * matched via Quick Match / the ranked queue, or when a challenge/invite is
 * accepted. This is the ONLY gameplay email Argos sends now: per-turn emails
 * were removed because they are unnecessary and noisy (a player who started
 * matchmaking on their phone and waited on their laptop would otherwise be
 * pinged for every single turn). One "it's on" email is enough — the live
 * room + realtime drive the rest.
 *
 * Safe to call fire-and-forget. Skips the Oracle system user (vs-AI debates
 * have no human opponent to notify on the AI side). Returns the number of
 * emails actually sent (0–2). No-ops entirely if RESEND_API_KEY is unset.
 */
export async function sendMatchNotification(debateId: string): Promise<number> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return 0; // not configured — silently skip

    try {
        const client = serviceClient();

        const { data: debate } = await client
            .from("debates")
            .select("id, status, player_a_id, player_b_id, topics (title)")
            .eq("id", debateId)
            .single();

        if (!debate) return 0;

        const topic = (debate.topics as unknown as { title: string } | null)?.title ?? "your debate";
        const link = `${APP_URL}/debate/${debateId}`;
        const resend = new Resend(apiKey);

        // The two seats, excluding the Oracle (never emailed).
        const seats: string[] = [debate.player_a_id, debate.player_b_id].filter(
            (idVal): idVal is string => !!idVal && idVal !== ORACLE_USER_ID
        );
        if (seats.length === 0) return 0;

        // Look up both players in one query, then map id -> {email, username}.
        const { data: people } = await client
            .from("users")
            .select("id, email, username")
            .in("id", seats);

        const byId = new Map(
            (people ?? []).map((p) => [p.id, p as { id: string; email: string | null; username: string | null }])
        );

        let sent = 0;
        for (const seatId of seats) {
            const me = byId.get(seatId);
            if (!me?.email) continue;
            const otherId = seats.find((s) => s !== seatId) ?? null;
            const opponentName =
                (otherId && byId.get(otherId)?.username) || "your opponent";

            const html = `
<div style="font-family:Georgia,serif;background:#07080a;color:#f5efe0;padding:32px;border-radius:10px;max-width:520px;margin:0 auto;">
  <p style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.28em;color:#c9a84c;text-transform:uppercase;margin:0 0 12px;">◆ Argos</p>
  <h1 style="font-family:'Times New Roman',serif;font-size:22px;color:#f5efe0;margin:0 0 16px;letter-spacing:0.03em;">You’re connected for a debate</h1>
  <p style="font-size:15px;line-height:1.6;color:#cfc0a0;margin:0 0 8px;">
    You’ve been matched against <strong style="color:#e8c46a;">${escapeHtml(opponentName)}</strong> on:
  </p>
  <p style="font-family:'Times New Roman',serif;font-size:17px;color:#f5efe0;margin:0 0 20px;line-height:1.4;">${escapeHtml(topic)}</p>
  <a href="${link}" style="display:inline-block;background:#c9a84c;color:#07080a;font-family:'Times New Roman',serif;font-weight:600;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;padding:12px 28px;border-radius:6px;">Enter the arena →</a>
  <p style="font-size:12px;color:#9a8c78;margin:24px 0 0;">The debate plays out live in the room — no more emails after this one.</p>
</div>`.trim();

            await resend.emails.send({
                from: FROM,
                to: me.email,
                subject: `You’re matched: ${topic}`,
                html,
            });
            sent += 1;
        }

        return sent;
    } catch (e) {
        console.error("sendMatchNotification error:", e);
        return 0;
    }
}

/**
 * @deprecated Per-turn emails were removed — they were unnecessary and noisy.
 * The only gameplay email Argos sends is now the single connection email
 * (sendMatchNotification), fired once when two players are matched / a
 * challenge is accepted. This function is retained as an INERT no-op so any
 * lingering caller compiles and is harmless; it never sends an email.
 */
export async function sendTurnNotification(_debateId: string): Promise<boolean> {
    void _debateId;
    return false;
}
