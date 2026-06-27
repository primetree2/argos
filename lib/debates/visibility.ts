// Server-side authorization + sanitization for reading a single debate.
//
// This is the application-layer guard for the debate read paths
// (app/debate/[id]/page.tsx and GET /api/debates/[id]). It is deliberately
// independent of Supabase RLS so the data boundary holds even if a policy is
// missing or overly permissive (defense in depth).
//
// Two protections:
//   1. Visibility: a non-participant may only read a PUBLIC debate.
//   2. Fairness: while a debate is ACTIVE, a viewer must not see an argument
//      that would reveal the opponent's not-yet-submitted move for the current
//      round. We therefore withhold any argument whose round_number is >= the
//      round the VIEWER has reached, for authors other than the viewer.
//      Spectators (non-participants) reach round 0, so they never see the
//      in-flight round on a live debate. Completed/scoring debates are shown in
//      full — the reveal is the whole point once play ends.

interface ArgumentLike {
    user_id: string;
    round_number: number;
}

interface DebateLike {
    status: string;
    is_public?: boolean | null;
    player_a_id: string | null;
    player_b_id: string | null;
    arguments?: ArgumentLike[] | null;
}

export function isParticipant(
    debate: Pick<DebateLike, "player_a_id" | "player_b_id">,
    userId: string
): boolean {
    return debate.player_a_id === userId || debate.player_b_id === userId;
}

// Returns null when the viewer is NOT permitted to see the debate at all
// (private debate, non-participant). Otherwise returns the debate with the
// opponent's in-flight argument(s) redacted for fairness on a live debate.
export function authorizeAndSanitizeDebate<T extends DebateLike>(
    debate: T,
    viewerId: string
): T | null {
    const participant = isParticipant(debate, viewerId);

    // Visibility gate: non-participants may only view public debates.
    if (!participant && debate.is_public === false) {
        return null;
    }

    // Fairness gate only applies to live (active) debates. Once a debate is in
    // scoring/completed, all arguments are intended to be visible.
    if (debate.status !== "active" || !Array.isArray(debate.arguments)) {
        return debate;
    }

    // The highest round the VIEWER has authored an argument for. A participant
    // who has submitted their round-N argument has "earned" the right to see
    // the opponent's round-N argument; a spectator has authored none (0).
    const viewerMaxRound = debate.arguments.reduce((max, a) => {
        if (a.user_id === viewerId && a.round_number > max) return a.round_number;
        return max;
    }, 0);

    const visibleArguments = debate.arguments.filter((a) => {
        if (a.user_id === viewerId) return true; // always see your own
        // Reveal an opponent's round only once the viewer has also submitted
        // that round (prevents reading the opponent's move before you commit).
        return a.round_number <= viewerMaxRound;
    });

    return { ...debate, arguments: visibleArguments };
}
