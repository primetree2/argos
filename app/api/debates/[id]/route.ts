import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { forfeitDebate } from "@/lib/debates/forfeit";
import { NextResponse } from "next/server";

// Service-role client — required for cross-user stat/Elo writes on resign,
// which RLS blocks for the anon SSR client.
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

        // The resigning player loses; the opponent wins regardless of score.
        const winnerId = debate.player_a_id === user.id ? debate.player_b_id : debate.player_a_id;
        const loserId = user.id;

        // Use the service client so the opponent's stats/Elo can be updated
        // (RLS forbids this for the SSR client) and settle the result.
        const settled = await forfeitDebate(serviceClient, id, winnerId, loserId);
        if (!settled) {
            return NextResponse.json({ error: "Debate already completed." }, { status: 409 });
        }

        const { data: updated, error } = await serviceClient
            .from("debates")
            .select()
            .eq("id", id)
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