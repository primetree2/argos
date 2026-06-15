import { createClient } from "@supabase/supabase-js";
import { forfeitDebate } from "@/lib/debates/forfeit";
import { NextResponse } from "next/server";

const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthorized(request: Request): boolean {
    const secret = process.env.CRON_SECRET;
    const header = request.headers.get("authorization");
    if (secret && header === `Bearer ${secret}`) return true;
    if (request.headers.get("x-vercel-cron") === "1") return true;
    return false;
}

// Runs daily. Deletes debates that are still 'waiting' after 24 hours —
// i.e. created but never joined by an opponent. Also resolves long-abandoned
// 'active' ghost debates that got stuck (e.g. a failed resign).
export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stale, error: fetchError } = await serviceClient
        .from("debates")
        .select("id")
        .eq("status", "waiting")
        .lt("created_at", cutoff);

    if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!stale || stale.length === 0) {
        return NextResponse.json({ deleted: 0, message: "No stale debates found." });
    }

    const ids = stale.map((d) => d.id);

    // Delete arguments first (foreign key)
    await serviceClient.from("arguments").delete().in("debate_id", ids);

    // Then delete the debates
    const { error: deleteError } = await serviceClient
        .from("debates")
        .delete()
        .in("id", ids);

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // ── Resolve "ghost" debates (Bug 3 & 4) ──
    // Active debates that are badly stuck — e.g. a resign that previously failed
    // silently, or a row the auto-forfeit cron can't advance because
    // turn_started_at is null. We use a generous 48h cutoff so we never touch a
    // live game; anything older is abandoned. The player NOT on turn (the one
    // who acted last) wins; if that is indeterminate we settle as a draw.
    const ghostCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: ghosts } = await serviceClient
        .from("debates")
        .select("id, player_a_id, player_b_id, current_turn")
        .eq("status", "active")
        .lt("created_at", ghostCutoff);

    const resolvedGhosts: string[] = [];
    for (const g of ghosts ?? []) {
        // Winner is whoever is NOT on turn (i.e. acted last). If we can't tell,
        // settle as a draw (null winner) so no Elo is awarded unfairly.
        let winnerId: string | null = null;
        let loserId: string | null = null;
        if (g.current_turn && g.player_a_id && g.player_b_id) {
            winnerId = g.current_turn === g.player_a_id ? g.player_b_id : g.player_a_id;
            loserId = g.current_turn;
        }
        const settled = await forfeitDebate(serviceClient, g.id, winnerId, loserId);
        if (settled) resolvedGhosts.push(g.id);
    }

    return NextResponse.json({
        deleted: ids.length,
        ids,
        ghostsResolved: resolvedGhosts.length,
        ghostIds: resolvedGhosts,
    });
}