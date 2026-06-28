import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ORACLE_USER_ID } from "@/lib/ai/oracle";
import { sendPush } from "@/lib/push/send";

// "Your turn" web push (ROADMAP 2.4 item 3 follow-up).
//
// Best-effort, FAIL-OPEN nudge to the player whose turn it now is. Safe to call
// fire-and-forget from any path that advances a turn (human submit, Oracle
// reply). It is a pure no-op unless:
//   - the debate is still `active` (not scoring/completed/waiting), AND
//   - `current_turn` is a real HUMAN (never the Oracle system user, never null).
//
// It resolves its own service client + the debate state, so callers pass only
// the debate id. sendPush() itself no-ops when push isn't configured/installed,
// so the entire chain is harmless before VAPID/web-push setup.

function serviceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function notifyTurn(debateId: string): Promise<void> {
    if (!debateId) return;
    try {
        const client = serviceClient();
        const { data: debate, error } = await client
            .from("debates")
            .select("id, status, current_turn, topics (title)")
            .eq("id", debateId)
            .single();

        if (error || !debate) return;
        if (debate.status !== "active") return;

        const turn = debate.current_turn as string | null;
        // Only a real human gets a "your turn" push.
        if (!turn || turn === ORACLE_USER_ID) return;

        const topic =
            (debate.topics as unknown as { title?: string } | { title?: string }[] | null);
        const title = Array.isArray(topic)
            ? topic[0]?.title ?? ""
            : topic?.title ?? "";

        await sendPush(turn, {
            title: "It's your turn",
            body: title ? `Make your move: ${title}` : "Your opponent has responded — make your move.",
            url: `/debate/${debateId}`,
        });
    } catch {
        /* fail-open — a missing push must never affect gameplay */
    }
}
