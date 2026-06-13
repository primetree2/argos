import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Auto-forfeit cron (#4).
// Runs every 5 minutes (see vercel.json). For every active debate whose current
// turn has been idle longer than the turn limit + grace, it submits a forfeit
// argument on behalf of the inactive player and advances the debate exactly the
// way a normal submission does, so debates can never hang forever.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We also accept
// Vercel's own cron header. Any other caller is rejected.

const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 10-minute turn + 1-minute grace = 11 minutes.
const TURN_TIMEOUT_MS = 11 * 60 * 1000;
const FORFEIT_TEXT =
    "[Forfeit] The allotted time elapsed before an argument was submitted. This turn is forfeited.";

function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    // If no secret is configured, only allow Vercel's internal cron header.
    const header = request.headers.get("authorization");
    if (secret && header === `Bearer ${secret}`) return true;
    if (request.headers.get("x-vercel-cron") === "1") return true;
    return false;
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - TURN_TIMEOUT_MS).toISOString();

    const { data: stale, error } = await serviceClient
        .from("debates")
        .select("id, player_a_id, player_b_id, current_turn, current_round, total_rounds, status, turn_started_at")
        .eq("status", "active")
        .not("turn_started_at", "is", null)
        .lt("turn_started_at", cutoff);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const processed: string[] = [];

    for (const d of stale ?? []) {
        // The player who must act is current_turn; if it is missing or the
        // opponent is missing, skip (nothing safe to advance to).
        const inactiveId = d.current_turn;
        if (!inactiveId || !d.player_b_id) continue;
        const opponentId =
            d.player_a_id === inactiveId ? d.player_b_id : d.player_a_id;
        if (!opponentId) continue;

        // 1. Insert a forfeit argument for the inactive player so the transcript
        //    and scoring pipeline stay consistent. It is marked failed (0 score)
        //    and never sent to the judge.
        const { data: forfeitArg, error: insertError } = await serviceClient
            .from("arguments")
            .insert({
                debate_id: d.id,
                user_id: inactiveId,
                round_number: d.current_round,
                content: FORFEIT_TEXT,
                scoring_status: "done",
                score_total: 0,
                score_clarity: 0,
                score_evidence: 0,
                score_logic: 0,
                score_rebuttal: 0,
                fallacy_penalty: 0,
                fallacies_found: [],
                ai_feedback: "Turn forfeited — no argument was submitted in time.",
            })
            .select()
            .single();

        if (insertError || !forfeitArg) continue;

        // 2. Advance the debate, mirroring DebateRoom.handleSubmit turn logic.
        const { data: roundArgs } = await serviceClient
            .from("arguments")
            .select("id")
            .eq("debate_id", d.id)
            .eq("round_number", d.current_round);

        // Two arguments now exist for this round (this forfeit completes it).
        const isLastArgOfRound = (roundArgs?.length ?? 0) >= 2;
        const nextRound = isLastArgOfRound ? d.current_round + 1 : d.current_round;
        const isLastRound = d.current_round >= d.total_rounds;
        const isFinalSubmission = isLastArgOfRound && isLastRound;

        await serviceClient
            .from("debates")
            .update({
                current_turn: opponentId,
                current_round: nextRound,
                status: isFinalSubmission ? "scoring" : "active",
                turn_started_at: new Date().toISOString(),
            })
            .eq("id", d.id)
            .eq("status", "active"); // guard against concurrent real submission

        // 3. If this forfeit ended the debate, trigger final scoring/completion.
        //    A 0-score forfeit is already "done", so the score route will see all
        //    arguments scored and finalise the debate + Elo.
        if (isFinalSubmission) {
            try {
                const { finalizeIfComplete } = await import("@/lib/debates/finalize");
                await finalizeIfComplete(serviceClient, d.id);
            } catch (e) {
                console.error("Forfeit finalize error:", e);
            }
        } else {
            // Debate continues — notify the player whose turn it now is (#3).
            try {
                const { sendTurnNotification } = await import("@/lib/email/resend");
                await sendTurnNotification(d.id);
            } catch (e) {
                console.error("Forfeit notify error:", e);
            }
        }

        processed.push(d.id);
    }

    return NextResponse.json({ forfeited: processed.length, debateIds: processed });
}
