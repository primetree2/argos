import { Resend } from "resend";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ORACLE_USER_ID } from "@/lib/ai/oracle";

// Turn email notifications (#3).
// Self-contained + fail-safe: if RESEND_API_KEY is unset, this no-ops so the
// debate turn flow is never blocked in dev/preview. All errors are swallowed
// and logged — a failed email must never break gameplay.

const FROM = process.env.RESEND_FROM_EMAIL ?? "Argos <notifications@argos-indol.vercel.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://argos-indol.vercel.app";

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function summarize(text: string | null, max = 220): string {
    if (!text) return "";
    const trimmed = text.trim().replace(/\s+/g, " ");
    if (trimmed.length <= max) return trimmed;
    return trimmed.slice(0, max).trimEnd() + "…";
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Email the player whose turn it now is. Looks up everything it needs from the
 * debate id. Safe to call fire-and-forget. Returns true if an email was sent.
 */
export async function sendTurnNotification(debateId: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false; // not configured — silently skip

    try {
        const client = serviceClient();

        const { data: debate } = await client
            .from("debates")
            .select("id, status, current_turn, player_a_id, player_b_id, topics (title)")
            .eq("id", debateId)
            .single();

        // Only notify when it is genuinely someone's turn in a live debate.
        if (!debate || debate.status !== "active" || !debate.current_turn) return false;

        const activeId = debate.current_turn;
        // The Oracle never gets emailed — its move is driven by the oracle-turn
        // route / maintenance cron, not by a notification.
        if (activeId === ORACLE_USER_ID) return false;
        const opponentId =
            debate.player_a_id === activeId ? debate.player_b_id : debate.player_a_id;

        const { data: activeUser } = await client
            .from("users")
            .select("email, username")
            .eq("id", activeId)
            .single();

        if (!activeUser?.email) return false;

        let opponentName = "your opponent";
        if (opponentId) {
            const { data: opp } = await client
                .from("users")
                .select("username")
                .eq("id", opponentId)
                .single();
            if (opp?.username) opponentName = opp.username;
        }

        // The opponent's most recent argument, for a short summary.
        let lastArg: string | null = null;
        if (opponentId) {
            const { data: args } = await client
                .from("arguments")
                .select("content")
                .eq("debate_id", debateId)
                .eq("user_id", opponentId)
                .order("submitted_at", { ascending: false })
                .limit(1);
            lastArg = args?.[0]?.content ?? null;
        }

        const topic = (debate.topics as unknown as { title: string } | null)?.title ?? "your debate";
        const link = `${APP_URL}/debate/${debateId}`;
        const summary = summarize(lastArg);

        const html = `
<div style="font-family:Georgia,serif;background:#07080a;color:#f5efe0;padding:32px;border-radius:10px;max-width:520px;margin:0 auto;">
  <p style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.28em;color:#c9a84c;text-transform:uppercase;margin:0 0 12px;">◆ Argos</p>
  <h1 style="font-family:'Times New Roman',serif;font-size:22px;color:#f5efe0;margin:0 0 16px;letter-spacing:0.03em;">It’s your turn</h1>
  <p style="font-size:15px;line-height:1.6;color:#cfc0a0;margin:0 0 8px;">
    <strong style="color:#e8c46a;">${escapeHtml(opponentName)}</strong> has made their move in:
  </p>
  <p style="font-family:'Times New Roman',serif;font-size:17px;color:#f5efe0;margin:0 0 20px;line-height:1.4;">${escapeHtml(topic)}</p>
  ${summary
                ? `<blockquote style="border-left:2px solid #00ffe0;background:rgba(0,255,224,0.06);padding:12px 16px;margin:0 0 24px;font-style:italic;font-size:14px;color:#cfc0a0;line-height:1.6;">“${escapeHtml(summary)}”</blockquote>`
                : ""}
  <a href="${link}" style="display:inline-block;background:#c9a84c;color:#07080a;font-family:'Times New Roman',serif;font-weight:600;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;padding:12px 28px;border-radius:6px;">Make your argument →</a>
  <p style="font-size:12px;color:#9a8c78;margin:24px 0 0;">The Oracle is waiting. You have 10 minutes once you begin.</p>
</div>`.trim();

        const resend = new Resend(apiKey);
        await resend.emails.send({
            from: FROM,
            to: activeUser.email,
            subject: `Your turn in: ${topic}`,
            html,
        });

        return true;
    } catch (e) {
        console.error("sendTurnNotification error:", e);
        return false;
    }
}
