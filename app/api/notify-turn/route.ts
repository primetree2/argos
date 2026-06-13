import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendTurnNotification } from "@/lib/email/resend";

// POST /api/notify-turn  { debateId }
// Emails the player whose turn it now is. Called fire-and-forget by the client
// after a turn advances. Verifies the caller is a participant; never throws on
// email failure (notifications must not block gameplay).
export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { debateId } = await request.json();
    if (!debateId) {
        return NextResponse.json({ error: "Missing debateId" }, { status: 400 });
    }

    // Verify the caller participates in this debate before doing any lookups.
    const { data: debate } = await supabase
        .from("debates")
        .select("player_a_id, player_b_id")
        .eq("id", debateId)
        .single();

    if (!debate || (debate.player_a_id !== user.id && debate.player_b_id !== user.id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sent = await sendTurnNotification(debateId);
    return NextResponse.json({ sent });
}
