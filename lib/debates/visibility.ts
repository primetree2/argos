// Server-side authorization + sanitization for reading a single debate.
//
// This is the application-layer guard for the debate read paths
// (app/debate/[id]/page.tsx and GET /api/debates/[id]). It is deliberately
// independent of Supabase RLS so the data boundary holds even if a policy is
// missing or overly permissive (defense in depth).
//
// Two protections:
//   1. Visibility: a non-participant may only read a PUBLIC debate.
//   2. Spectator fairness: Argos debates are STRICTLY SEQUENTIAL — only one
//      player submits at a time and current_turn alternates after every move
//      (see submit_argument). A participant therefore MUST see the opponent's
//      already-submitted argument the instant it lands: that is the argument
//      they have to read and rebut on their turn. Hiding it would freeze the
//      live feed for the player whose turn it is (the original bug). The only
//      viewer we redact is a SPECTATOR (non-participant) watching a live
//      debate: they should not see the newest, not-yet-scored argument before
//      the players have moved on past it. Completed/scoring debates are shown
//      in full to everyone permitted to view them.

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
// (private debate, non-participant). Otherwise returns the debate, redacting
// the in-flight round ONLY for spectators on a live debate.
export function authorizeAndSanitizeDebate<T extends DebateLike>(
    debate: T,
    viewerId: string
): T | null {
    const participant = isParticipant(debate, viewerId);

    // Visibility gate: non-participants may only view public debates.
    if (!participant && debate.is_public === false) {
        return null;
    }

    // Participants always see every submitted argument. In a sequential debate
    // the player whose turn it is needs to read the opponent's latest argument
    // to respond — withholding it is what broke the live feed.
    if (participant) {
        return debate;
    }

    // From here the viewer is a SPECTATOR. The fairness redaction only applies
    // while the debate is live (active); scoring/completed reveal everything.
    if (debate.status !== "active" || !Array.isArray(debate.arguments)) {
        return debate;
    }

    // Hide only the newest in-flight round from spectators so the crowd can't
    // read an argument before the opposing player does. The current round in
    // play is the highest round_number present; redact arguments in that round.
    const inFlightRound = debate.arguments.reduce(
        (max, a) => (a.round_number > max ? a.round_number : max),
        0
    );

    const visibleArguments = debate.arguments.filter(
        (a) => a.round_number < inFlightRound
    );

    return { ...debate, arguments: visibleArguments };
}
