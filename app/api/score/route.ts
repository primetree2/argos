import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { scoreArgument } from "@/lib/ai/judge";
import { NextResponse } from "next/server";

// Service role client — bypasses RLS for writing scores
const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { argumentId } = await request.json();

    // Fetch argument + debate context using service client
    const { data: arg, error: argError } = await serviceClient
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
    await serviceClient
        .from("arguments")
        .update({ scoring_status: "scoring" })
        .eq("id", argumentId);

    // Get previous argument from opponent for rebuttal context
    const { data: prevArgs } = await serviceClient
        .from("arguments")
        .select("content")
        .eq("debate_id", arg.debate_id)
        .neq("user_id", arg.user_id)
        .order("submitted_at", { ascending: false })
        .limit(1);

    const prevArgument = prevArgs?.[0]?.content ?? null;

    // Determine side
    const isPlayerA = arg.debates.player_a_id === arg.user_id;
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

        // Write score back
        const { data: updated } = await serviceClient
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

        // If this was the last argument, check if all arguments are scored
        // and mark debate as completed
        const { data: allArgs } = await serviceClient
            .from("arguments")
            .select("scoring_status")
            .eq("debate_id", arg.debate_id);

        const { data: debate } = await serviceClient
            .from("debates")
            .select("status, total_rounds")
            .eq("id", arg.debate_id)
            .single();

        if (debate?.status === "scoring") {
            const allScored = allArgs?.every((a) => a.scoring_status === "done");
            if (allScored) {
                await serviceClient
                    .from("debates")
                    .update({ status: "completed" })
                    .eq("id", arg.debate_id);
            }
        }

        return NextResponse.json({ score, argument: updated });
    } catch (error) {
        console.error("Scoring error:", error);

        await serviceClient
            .from("arguments")
            .update({ scoring_status: "failed" })
            .eq("id", argumentId);

        return NextResponse.json(
            { error: "Scoring failed", details: String(error) },
            { status: 500 }
        );
    }
}