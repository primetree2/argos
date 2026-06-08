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

    // Fetch and moderate content before scoring
    const { data: argCheck } = await serviceClient
        .from("arguments")
        .select("content")
        .eq("id", argumentId)
        .single();

    if (argCheck) {
        const { moderateContent } = await import("@/lib/moderation");
        const modResult = moderateContent(argCheck.content);
        if (!modResult.allowed) {
            await serviceClient
                .from("arguments")
                .update({ scoring_status: "failed", ai_feedback: modResult.reason })
                .eq("id", argumentId);
            return NextResponse.json({ error: modResult.reason }, { status: 400 });
        }
    }

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
                // Calculate final scores
                const { data: finalArgs } = await serviceClient
                    .from("arguments")
                    .select("user_id, score_total")
                    .eq("debate_id", arg.debate_id);

                const { data: debateFull } = await serviceClient
                    .from("debates")
                    .select("player_a_id, player_b_id, mode")
                    .eq("id", arg.debate_id)
                    .single();

                if (debateFull && finalArgs) {
                    const scoreA = finalArgs
                        .filter((a) => a.user_id === debateFull.player_a_id)
                        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);
                    const scoreB = finalArgs
                        .filter((a) => a.user_id === debateFull.player_b_id)
                        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);

                    const winnerId = scoreA > scoreB
                        ? debateFull.player_a_id
                        : scoreB > scoreA
                            ? debateFull.player_b_id
                            : null;

                    // Update debate as completed
                    await serviceClient
                        .from("debates")
                        .update({ status: "completed", winner_id: winnerId })
                        .eq("id", arg.debate_id);

                    // Update Elo only for ranked debates
                    if (debateFull.mode === "ranked" && winnerId) {
                        const loserId = winnerId === debateFull.player_a_id
                            ? debateFull.player_b_id
                            : debateFull.player_a_id;

                        const { data: winner } = await serviceClient
                            .from("users")
                            .select("elo_rating, debates_won")
                            .eq("id", winnerId)
                            .single();

                        const { data: loser } = await serviceClient
                            .from("users")
                            .select("elo_rating, debates_lost")
                            .eq("id", loserId)
                            .single();

                        if (winner && loser) {
                            const winnerGames = (winner.debates_won ?? 0);
                            const loserGames = (loser.debates_lost ?? 0);
                            const kFactor = (games: number) => games < 30 ? 32 : 16;

                            const expectedWinner = 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400));
                            const newWinnerElo = Math.round(winner.elo_rating + kFactor(winnerGames) * (1 - expectedWinner));
                            const newLoserElo = Math.round(loser.elo_rating + kFactor(loserGames) * (0 - (1 - expectedWinner)));

                            // Update winner
                            await serviceClient
                                .from("users")
                                .update({
                                    elo_rating: newWinnerElo,
                                    debates_won: winnerGames + 1,
                                })
                                .eq("id", winnerId);

                            // Update loser
                            await serviceClient
                                .from("users")
                                .update({
                                    elo_rating: newLoserElo,
                                    debates_lost: loserGames + 1,
                                })
                                .eq("id", loserId);

                            // Record elo history
                            await serviceClient.from("elo_history").insert([
                                {
                                    user_id: winnerId,
                                    debate_id: arg.debate_id,
                                    elo_before: winner.elo_rating,
                                    elo_after: newWinnerElo,
                                },
                                {
                                    user_id: loserId,
                                    debate_id: arg.debate_id,
                                    elo_before: loser.elo_rating,
                                    elo_after: newLoserElo,
                                },
                            ]);
                        }
                    }
                    // Update win/loss counts for casual
                    if (debateFull.mode === "casual" && winnerId) {
                        const loserId = winnerId === debateFull.player_a_id
                            ? debateFull.player_b_id
                            : debateFull.player_a_id;

                        const { data: w } = await serviceClient
                            .from("users").select("debates_won").eq("id", winnerId).single();
                        const { data: l } = await serviceClient
                            .from("users").select("debates_lost").eq("id", loserId).single();

                        await serviceClient
                            .from("users")
                            .update({ debates_won: (w?.debates_won ?? 0) + 1 })
                            .eq("id", winnerId);

                        await serviceClient
                            .from("users")
                            .update({ debates_lost: (l?.debates_lost ?? 0) + 1 })
                            .eq("id", loserId);
                    }
                }
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