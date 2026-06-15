import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: debate, error } = await supabase
        .from("debates")
        .select(`
      *,
      topics (title, category),
      arguments (
        id, user_id, round_number, content, submitted_at,
        score_total, score_clarity, score_evidence, score_logic,
        score_rebuttal, fallacy_penalty, fallacies_found,
        ai_feedback, scoring_status
      )
    `)
        .eq("id", id)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ debate });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // ── Resign action ──
    if (body.action === "resign") {
        const { data: debate } = await supabase
            .from("debates")
            .select("player_a_id, player_b_id, status")
            .eq("id", id)
            .single();

        if (!debate) return NextResponse.json({ error: "Debate not found." }, { status: 404 });
        if (debate.status === "completed") return NextResponse.json({ error: "Debate already completed." }, { status: 409 });

        const isParticipant = debate.player_a_id === user.id || debate.player_b_id === user.id;
        if (!isParticipant) return NextResponse.json({ error: "Not a participant." }, { status: 403 });

        const winnerId = debate.player_a_id === user.id ? debate.player_b_id : debate.player_a_id;

        // Update winner stats
        if (winnerId) {
            await supabase.from("users").update({ debates_won: supabase.rpc("increment", { row_id: winnerId, column_name: "debates_won" }) });
            await supabase.from("users").update({ debates_lost: supabase.rpc("increment", { row_id: user.id, column_name: "debates_lost" }) });
        }

        const { data: updated, error } = await supabase
            .from("debates")
            .update({ status: "completed", winner_id: winnerId })
            .eq("id", id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ debate: updated });
    }

    // ── Default PATCH ──
    const { data: debate, error } = await supabase
        .from("debates")
        .update(body)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ debate });
}