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
//   4. Fire-and-forget scoring + turn notification.

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

    // Moderate BEFORE any write. Authoritative server-side gate.
    const mod = moderateContent(trimmed);
    if (!mod.allowed) {
        return NextResponse.json({ error: mod.reason }, { status: 400 });
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

    // Fire-and-forget: trigger scoring for this argument.
    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/score`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // Forward the caller's cookies so /api/score can authenticate.
            cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ argumentId }),
    }).catch(() => { });

    // Notify the player whose turn it now is (no-op if the debate just entered
    // scoring; sendTurnNotification checks status === 'active').
    try {
        const { sendTurnNotification } = await import("@/lib/email/resend");
        sendTurnNotification(id).catch(() => { });
    } catch {
        /* non-critical */
    }

    return NextResponse.json({ argumentId });
}
