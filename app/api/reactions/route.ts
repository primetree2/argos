import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Argument reactions (#7).
//   GET  ?debateId=...        → all reaction counts for a debate + the caller's own reactions
//   POST { argumentId, reactionType } → toggle the caller's reaction
//
// Reactions are only allowed on arguments belonging to COMPLETED, PUBLIC debates
// (spectators + players reacting to finished content).

const VALID = new Set(["strong", "brutal", "questionable"]);

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const debateId = searchParams.get("debateId");
    if (!debateId) {
        return NextResponse.json({ error: "Missing debateId" }, { status: 400 });
    }

    // Argument ids for this debate.
    const { data: args } = await supabase
        .from("arguments")
        .select("id")
        .eq("debate_id", debateId);
    const argIds = (args ?? []).map((a) => a.id);
    if (argIds.length === 0) {
        return NextResponse.json({ counts: {}, mine: {} });
    }

    const { data: reactions } = await supabase
        .from("argument_reactions")
        .select("argument_id, user_id, reaction_type")
        .in("argument_id", argIds);

    // counts[argumentId][reactionType] = number
    const counts: Record<string, Record<string, number>> = {};
    // mine[argumentId] = reactionType chosen by the caller
    const mine: Record<string, string> = {};

    for (const r of reactions ?? []) {
        counts[r.argument_id] ??= {};
        counts[r.argument_id][r.reaction_type] =
            (counts[r.argument_id][r.reaction_type] ?? 0) + 1;
        if (user && r.user_id === user.id) mine[r.argument_id] = r.reaction_type;
    }

    return NextResponse.json({ counts, mine });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { argumentId, reactionType } = await request.json();
    if (!argumentId || !VALID.has(reactionType)) {
        return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
    }

    // Verify the argument belongs to a completed, public debate.
    const { data: arg } = await supabase
        .from("arguments")
        .select("id, debates (status, is_public)")
        .eq("id", argumentId)
        .single();

    const debate = arg?.debates as unknown as { status: string; is_public: boolean | null } | null;
    if (!arg || !debate || debate.status !== "completed" || debate.is_public === false) {
        return NextResponse.json(
            { error: "Reactions are only allowed on completed public debates." },
            { status: 403 }
        );
    }

    // Toggle behaviour: look for an existing reaction by this user on this argument.
    const { data: existing } = await supabase
        .from("argument_reactions")
        .select("id, reaction_type")
        .eq("argument_id", argumentId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (existing) {
        if (existing.reaction_type === reactionType) {
            // Same reaction → remove it (toggle off).
            await supabase.from("argument_reactions").delete().eq("id", existing.id);
            return NextResponse.json({ state: "removed", reactionType });
        }
        // Different reaction → switch.
        await supabase
            .from("argument_reactions")
            .update({ reaction_type: reactionType })
            .eq("id", existing.id);
        return NextResponse.json({ state: "switched", reactionType });
    }

    await supabase
        .from("argument_reactions")
        .insert({ argument_id: argumentId, user_id: user.id, reaction_type: reactionType });
    return NextResponse.json({ state: "added", reactionType });
}
