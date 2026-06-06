import { createClient } from "@/lib/supabase/server";
import { scoreArgument } from "@/lib/ai/judge";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { argumentId } = await request.json();

    // Fetch the argument + debate context
    const { data: arg, error: argError } = await supabase
        .from("arguments")
        .select(`
      *,
      debates (
        topic_id,
        player_a_id,
        player_a_side,
        topics (title)
      )
    `)
        .eq("id", argumentId)
        .single();

    if (argError || !arg) {
        return NextResponse.json({ error: "Argument not found" }, { status: 404 });
    }

    // Prevent double scoring
    if (arg.scoring_status === "done") {
        return NextResponse.json({ error: "Already scored" }, { status: 400 });
    }

    // Mark as scoring
    await supabase
        .from("arguments")
        .update({ scoring_status: "scoring" })
        .eq("id", argumentId);

    // Get previous argument for rebuttal scoring
    const { data: prevArgs } = await supabase
        .from("arguments")
        .select("content")
        .eq("debate_id", arg.debate_id)
        .neq("user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1);

    const prevArgument = prevArgs?.[0]?.content ?? null;

    // Determine side
    const isPlayerA = arg.debates.player_a_id === user.id;
    const side = isPlayerA
        ? arg.debates.player_a_side
        : arg.debates.player_a_side === "FOR"
            ? "AGAINST"
            : "FOR";

    try {
        const score = await scoreArgument(
            arg.debates.topics.title,
            side as "FOR" | "AGAINST",
            arg.content,
            prevArgument
        );

        // Save score to DB
        const { data: updated } = await supabase
            .from("arguments")
            .update({
                score_total: score.total,
                score_clarity: score.clarity,
                score_evidence: score.evidence,
                score_logic: score.logic,
                score_rebuttal: score.rebuttal,
                fallacy_penalty: score.fallacy_penalty,
                fallacies_found: score.fallacies_found,
                ai_feedback: score.feedback,
                scoring_status: "done",
            })
            .eq("id", argumentId)
            .select()
            .single();

        return NextResponse.json({ score, argument: updated });
    } catch (error) {
        await supabase
            .from("arguments")
            .update({ scoring_status: "failed" })
            .eq("id", argumentId);

        return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
    }
}