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
//      live feed for the player whose turn it is (the original bug). So
//      participants always see everything.
//
//      A SPECTATOR watches the FULL debate as it unfolds — every past round
//      and every already-scored argument in the current round, so a late
//      joiner can catch up on the whole match. The ONLY thing withheld from a
//      spectator on a live debate is the single newest, NOT-YET-SCORED
//      in-flight argument: once the Oracle has scored it (or the opponent has
//      responded and a higher round exists) it is revealed. This keeps the
//      crowd from reading a brand-new argument before the Oracle/opponent has,
//      while never hiding the rest of the match. Completed/scoring debates are
//      shown in full to everyone permitted to view them.

interface ArgumentLike {
    user_id: string;
    round_number: number;
    scoring_status?: string | null;
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

// Given a debate's arguments, return the set of argument identities (by
// user_id + round_number) that should be HIDDEN from a spectator on a live
// debate. This is at most ONE argument: the newest in-flight move that has not
// yet been scored. Everything else — every past round, and any already-scored
// argument in the current round — is visible so the spectator can watch the
// complete debate as it happens.
function spectatorHiddenKey(
    args: ArgumentLike[]
): { userId: string; round: number } | null {
    if (args.length === 0) return null;
    const inFlightRound = args.reduce(
        (max, a) => (a.round_number > max ? a.round_number : max),
        0
    );
    // The latest move in the current round. If it is already scored, nothing is
    // hidden — it is safe for the crowd to read.
    const inFlight = args
        .filter((a) => a.round_number === inFlightRound)
        .reduce<ArgumentLike | null>((latest, a) => {
            if (!latest) return a;
            return a; // arguments arrive ordered; keep the last seen in-round
        }, null);
    if (!inFlight) return null;
    if (inFlight.scoring_status === "done") return null;
    return { userId: inFlight.user_id, round: inFlight.round_number };
}

// Returns null when the viewer is NOT permitted to see the debate at all
// (private debate, non-participant). Otherwise returns the debate, redacting
// only the single newest unscored in-flight argument for spectators on a live
// debate.
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

    const hidden = spectatorHiddenKey(debate.arguments);
    if (!hidden) return debate;

    const visibleArguments = debate.arguments.filter(
        (a) => !(a.user_id === hidden.userId && a.round_number === hidden.round)
    );

    return { ...debate, arguments: visibleArguments };
}
