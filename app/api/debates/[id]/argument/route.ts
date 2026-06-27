import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { moderateContent } from "@/lib/moderation";
import { NextResponse } from "next/server";

// POST /api/debates/[id]/argument  { content }
//
// Single authoritative entry point for submitting an argument. Replaces the
// previous client-side flow (direct Supabase insert + separate PATCH advance),
// which allowed unmoderated content to be inserted and the round to be
// advanced twice under a race.
//
// Responsibilities, in order:
//   1. Authenticate the caller.
//   2. Moderate the content BEFORE anything is written.
//   3. Insert + advance atomically via the submit_argument SQL function
//      (locks the debate row; serializes concurrent submissions).
//   4. Trigger scoring as a TRUSTED system call (internal secret + userId),
//      not via the caller's forwarded cookie. Forwarding the cookie meant a
//      stale/missing mobile session caused /api/score to 401 and the argument
//      to stay 'pending' forever. We await it so a failure is observable and
//      recoverable rather than silently swallowed.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RPC_ERROR_STATUS: Record<string, number> = {
    debate_not_found: 404,
    debate_not_active: 409,
    not_a_participant: 403,
    not_your_turn: 409,
    already_submitted_this_round: 409,
};

function rpcErrorMessage(raw: string): { status: number; message: string } {
    for (const key of Object.keys(RPC_ERROR_STATUS)) {
        if (raw.includes(key)) {
            const message = key.replace(/_/g, " ");
            return { status: RPC_ERROR_STATUS[key], message };
        }
    }
    return { status: 500, message: "Failed to submit argument." };
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { content } = await request.json();
    if (typeof content !== "string") {
        return NextResponse.json({ error: "Missing content." }, { status: 400 });
    }

    const trimmed = content.trim();

    // Moderate BEFORE any write. Two gates, cheapest first:
    //   1. Cheap, always-on regex/length filter (lib/moderation.ts).
    //   2. Gemini safety pass for the categories a regex can't catch
    //      (targeted harassment, hate, doxxing, spam). Fail-open: a Gemini
    //      outage never blocks a legitimate user (see moderateWithOracle).
    const mod = moderateContent(trimmed);
    if (!mod.allowed) {
        return NextResponse.json({ error: mod.reason }, { status: 400 });
    }

    const { moderateWithOracle } = await import("@/lib/ai/judge");
    const safety = await moderateWithOracle(trimmed);
    if (!safety.allowed) {
        return NextResponse.json({ error: safety.reason }, { status: 400 });
    }

    // Atomic insert + turn/round advance. The SQL function enforces turn,
    // participation, status, and one-argument-per-round under a row lock.
    const { data: argId, error } = await serviceClient.rpc("submit_argument", {
        p_debate_id: id,
        p_user_id: user.id,
        p_content: trimmed,
    });

    if (error) {
        const { status, message } = rpcErrorMessage(error.message);
        return NextResponse.json({ error: message }, { status });
    }

    const argumentId = typeof argId === "string" ? argId : null;
    if (!argumentId) {
        return NextResponse.json({ error: "Failed to submit argument." }, { status: 500 });
    }

    // Async scoring (ROADMAP Phase 2). Scoring is decoupled from this request:
    //   1. Enqueue a durable scoring_jobs row (migration 0009). This is the
    //      authoritative backstop — the maintenance cron drains the queue if the
    //      fire-and-forget call below never lands.
    //   2. Fire the score call WITHOUT awaiting it, so submit returns promptly
    //      instead of blocking up to 30s x retries on Gemini. The argument is
    //      already safely persisted as 'pending'; the queue, the cron requeue,
    //      and the client self-heal all recover a dropped trigger.
    const origin = new URL(request.url).origin;
    try {
        await serviceClient.rpc("enqueue_scoring_job", {
            p_argument_id: argumentId,
            p_user_id: user.id,
        });
    } catch {
        /* the cron also scans stuck 'pending' arguments, so this is non-fatal */
    }
    try {
        void fetch(`${origin}/api/score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-secret": process.env.CRON_SECRET ?? "",
            },
            body: JSON.stringify({ argumentId, userId: user.id }),
        });
    } catch {
        /* recovered asynchronously by the queue / maintenance requeue / self-heal */
    }

    // vs-Oracle: if the opponent is the Oracle and it is now its turn, drive
    // the Oracle's move as a trusted internal call. The maintenance cron is the
    // free backstop if this trigger is dropped. We do NOT await it so the
    // human's submit returns promptly; the UI picks up the Oracle's reply via
    // Realtime once it lands. Skipped entirely for human-vs-human debates.
    const { ORACLE_USER_ID } = await import("@/lib/ai/oracle");
    const { data: postState } = await serviceClient
        .from("debates")
        .select("player_b_id, status, current_turn")
        .eq("id", id)
        .single();

    const isOracleTurnNow =
        postState?.player_b_id === ORACLE_USER_ID &&
        postState?.status === "active" &&
        postState?.current_turn === ORACLE_USER_ID;

    if (isOracleTurnNow) {
        try {
            void fetch(`${origin}/api/debates/${id}/oracle-turn`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": process.env.CRON_SECRET ?? "",
                },
            });
        } catch {
            /* recovered by maintenance cron oracle backstop */
        }
    } else {
        // Notify the human player whose turn it now is (no-op if the debate just
        // entered scoring; sendTurnNotification checks status === 'active').
        try {
            const { sendTurnNotification } = await import("@/lib/email/resend");
            sendTurnNotification(id).catch(() => { });
        } catch {
            /* non-critical */
        }
    }

    return NextResponse.json({ argumentId });
}
