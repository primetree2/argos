import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { forfeitDebate } from "@/lib/debates/forfeit";

// Combined maintenance cron.
//
// Vercel's free Hobby plan allows a maximum of 2 cron jobs, each able to run
// at most once per day. To stay within those limits we merge the previous
// `auto-forfeit` and `cleanup-stale` jobs into this single daily route.
//
// It performs, in order:
//   1. Auto-forfeit: advance any active debate whose current turn has been
//      idle longer than the turn limit + grace.
//   2. Cleanup: delete `waiting` debates older than 24h that were never joined.
//   3. Ghost resolution: settle long-abandoned `active` debates (48h+).
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
    const header = request.headers.get("authorization");
    if (secret && header === `Bearer ${secret}`) return true;
    if (request.headers.get("x-vercel-cron") === "1") return true;
    return false;
}

// ── Step 1: auto-forfeit idle turns ──────────────────────────────────────────
async function runAutoForfeit(): Promise<{ forfeited: string[]; error?: string }> {
    const cutoff = new Date(Date.now() - TURN_TIMEOUT_MS).toISOString();

    const { data: stale, error } = await serviceClient
        .from("debates")
        .select(
            "id, player_a_id, player_b_id, current_turn, current_round, total_rounds, status, turn_started_at"
        )
        .eq("status", "active")
        .not("turn_started_at", "is", null)
        .lt("turn_started_at", cutoff);

    if (error) return { forfeited: [], error: error.message };

    const processed: string[] = [];

    for (const d of stale ?? []) {
        const inactiveId = d.current_turn;
        if (!inactiveId || !d.player_b_id) continue;
        const opponentId =
            d.player_a_id === inactiveId ? d.player_b_id : d.player_a_id;
        if (!opponentId) continue;

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
                ai_feedback:
                    "Turn forfeited \u2014 no argument was submitted in time.",
            })
            .select()
            .single();

        if (insertError || !forfeitArg) continue;

        const { data: roundArgs } = await serviceClient
            .from("arguments")
            .select("id")
            .eq("debate_id", d.id)
            .eq("round_number", d.current_round);

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

        if (isFinalSubmission) {
            try {
                const { finalizeIfComplete } = await import("@/lib/debates/finalize");
                await finalizeIfComplete(serviceClient, d.id);
            } catch (e) {
                console.error("Forfeit finalize error:", e);
            }
        } else {
            try {
                const { sendTurnNotification } = await import("@/lib/email/resend");
                await sendTurnNotification(d.id);
            } catch (e) {
                console.error("Forfeit notify error:", e);
            }
        }

        processed.push(d.id);
    }

    return { forfeited: processed };
}

// ── Step 2 & 3: cleanup waiting debates + resolve ghost active debates ───────
async function runCleanup(): Promise<{
    deleted: string[];
    ghostsResolved: string[];
    error?: string;
}> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stale, error: fetchError } = await serviceClient
        .from("debates")
        .select("id")
        .eq("status", "waiting")
        .lt("created_at", cutoff);

    if (fetchError) return { deleted: [], ghostsResolved: [], error: fetchError.message };

    const ids = (stale ?? []).map((d) => d.id);

    if (ids.length > 0) {
        // Delete arguments first (foreign key), then the debates.
        await serviceClient.from("arguments").delete().in("debate_id", ids);
        const { error: deleteError } = await serviceClient
            .from("debates")
            .delete()
            .in("id", ids);
        if (deleteError)
            return { deleted: [], ghostsResolved: [], error: deleteError.message };
    }

    // Resolve "ghost" active debates abandoned for 48h+. The player NOT on turn
    // (acted last) wins; if indeterminate we settle as a draw (null winner).
    const ghostCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: ghosts } = await serviceClient
        .from("debates")
        .select("id, player_a_id, player_b_id, current_turn")
        .eq("status", "active")
        .lt("created_at", ghostCutoff);

    const resolvedGhosts: string[] = [];
    for (const g of ghosts ?? []) {
        let winnerId: string | null = null;
        let loserId: string | null = null;
        if (g.current_turn && g.player_a_id && g.player_b_id) {
            winnerId =
                g.current_turn === g.player_a_id ? g.player_b_id : g.player_a_id;
            loserId = g.current_turn;
        }
        const settled = await forfeitDebate(serviceClient, g.id, winnerId, loserId);
        if (settled) resolvedGhosts.push(g.id);
    }

    return { deleted: ids, ghostsResolved: resolvedGhosts };
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const forfeit = await runAutoForfeit();
    const cleanup = await runCleanup();

    return NextResponse.json({
        autoForfeit: {
            forfeited: forfeit.forfeited.length,
            debateIds: forfeit.forfeited,
            error: forfeit.error,
        },
        cleanup: {
            deleted: cleanup.deleted.length,
            ids: cleanup.deleted,
            ghostsResolved: cleanup.ghostsResolved.length,
            ghostIds: cleanup.ghostsResolved,
            error: cleanup.error,
        },
    });
}
