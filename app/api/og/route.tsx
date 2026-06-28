import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

// Shareable "Oracle's verdict" scorecard (ROADMAP §2.4 item 5 — the built-in
// growth loop). Oracle Terminal aesthetic + the sharpest fallacy call-out.
//
// PUBLIC + UNAUTHENTICATED: it must never expose a private debate's topic or
// scores. A private/missing debate falls back to the generic brand card.

const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Oracle Terminal palette (mirrors globals.css / the email template).
const VOID = "#07080a";
const SURFACE = "#101216";
const GOLD = "#c9a84c";
const GOLD_BRIGHT = "#e8c46a";
const TEAL = "#5fb3b3";
const RED = "#e0564c";
const TEXT = "#f5efe0";
const MUTED = "#9a8c78";
const DIM = "#5c5648";

const SIZE = { width: 1200, height: 630 } as const;

function brandCard() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: VOID,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "serif",
                }}
            >
                <span style={{ color: GOLD, fontSize: 22, letterSpacing: 12, textTransform: "uppercase" }}>
                    ◆ The Oracle Debate Arena
                </span>
                <span style={{ color: TEXT, fontSize: 92, fontWeight: 700, letterSpacing: 4, marginTop: 12 }}>
                    ARGOS
                </span>
                <span style={{ color: MUTED, fontSize: 24, fontStyle: "italic", marginTop: 16 }}>
                    Where arguments are judged by an ancient intelligence.
                </span>
            </div>
        ),
        SIZE
    );
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const debateId = searchParams.get("debate_id");

    if (!debateId) return brandCard();

    const { data: debate } = await serviceClient
        .from("debates")
        .select(`
      *,
      topics (title, category),
      arguments (user_id, score_total, fallacy_penalty, fallacies_found)
    `)
        .eq("id", debateId)
        .single();

    if (!debate || debate.is_public === false) return brandCard();

    const topicTitle =
        (debate.topics as unknown as { title?: string } | null)?.title ?? "Untitled debate";

    const { data: playerA } = await serviceClient
        .from("users")
        .select("username, elo_rating")
        .eq("id", debate.player_a_id)
        .single();

    const { data: playerB } = debate.player_b_id
        ? await serviceClient
            .from("users")
            .select("username, elo_rating")
            .eq("id", debate.player_b_id)
            .single()
        : { data: null };

    type Fallacy = { name?: string; quote?: string };
    type ArgRow = {
        user_id: string;
        score_total: number | null;
        fallacy_penalty: number | null;
        fallacies_found: Fallacy[] | null;
    };
    const debateArgs = (debate.arguments ?? []) as ArgRow[];

    const scoreA = debateArgs
        .filter((a) => a.user_id === debate.player_a_id)
        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);
    const scoreB = debateArgs
        .filter((a) => a.user_id === debate.player_b_id)
        .reduce((sum, a) => sum + (a.score_total ?? 0), 0);

    const aWins = scoreA > scoreB;
    const bWins = scoreB > scoreA;

    const winnerName = debate.winner_id
        ? debate.winner_id === debate.player_a_id
            ? playerA?.username
            : debate.winner_id === debate.player_b_id
                ? playerB?.username
                : null
        : aWins
            ? playerA?.username
            : bWins
                ? playerB?.username
                : null;

    // Player A's stored side; B is the opposite.
    const sideA = (debate.player_a_side as "FOR" | "AGAINST") ?? "FOR";
    const sideB = sideA === "FOR" ? "AGAINST" : "FOR";

    // The sharpest fallacy across the whole debate: the argument with the
    // largest penalty contributes its first named fallacy. This is the spicy,
    // shareable call-out (ROADMAP §2.4 item 5). Penalties are <= 0, so a more
    // negative value is "sharper".
    let sharpest: { name: string; quote: string } | null = null;
    let worstPenalty = 0;
    for (const a of debateArgs) {
        const pen = a.fallacy_penalty ?? 0;
        const first = a.fallacies_found?.[0];
        if (first?.name && pen < worstPenalty) {
            worstPenalty = pen;
            sharpest = { name: first.name, quote: (first.quote ?? "").trim() };
        }
    }
    if (sharpest && sharpest.quote.length > 90) {
        sharpest.quote = sharpest.quote.slice(0, 87) + "…";
    }

    const playerBlock = (
        name: string,
        side: "FOR" | "AGAINST",
        score: number,
        won: boolean
    ) => (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
                background: won ? "rgba(201,168,76,0.10)" : SURFACE,
                border: `2px solid ${won ? GOLD : "#26282e"}`,
                borderRadius: 16,
                padding: "22px 28px",
            }}
        >
            <span style={{ color: won ? GOLD_BRIGHT : MUTED, fontSize: 22, letterSpacing: 1 }}>
                {name}
            </span>
            <span style={{ color: side === "FOR" ? GOLD : TEAL, fontSize: 13, letterSpacing: 4, marginTop: 4, textTransform: "uppercase" }}>
                {side}
            </span>
            <span style={{ color: won ? GOLD : TEXT, fontSize: 72, fontWeight: 700, lineHeight: 1, marginTop: 10 }}>
                {score}
            </span>
            <span style={{ color: DIM, fontSize: 13, marginTop: 2, letterSpacing: 2, textTransform: "uppercase" }}>points</span>
        </div>
    );

    return new ImageResponse(
        (
            <div
                style={{
                    background: VOID,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    padding: "54px 60px",
                    fontFamily: "serif",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: GOLD, fontSize: 20, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase" }}>
                        ◆ The Oracle&apos;s Verdict
                    </span>
                    <span style={{ color: TEXT, fontSize: 26, fontWeight: 700, letterSpacing: 3 }}>ARGOS</span>
                </div>

                {/* Gold rule */}
                <div style={{ display: "flex", height: 2, width: "100%", marginTop: 16, background: "linear-gradient(90deg, #c9a84c 0%, rgba(201,168,76,0.25) 70%, rgba(201,168,76,0) 100%)" }} />

                {/* Topic */}
                <div style={{ color: TEXT, fontSize: 40, fontWeight: 700, lineHeight: 1.18, marginTop: 26, maxWidth: 1000, display: "flex" }}>
                    {topicTitle}
                </div>

                {/* Scores */}
                <div style={{ display: "flex", gap: 28, alignItems: "stretch", marginTop: 28 }}>
                    {playerBlock(playerA?.username ?? "Player A", sideA, scoreA, aWins)}
                    <div style={{ display: "flex", alignItems: "center", color: DIM, fontSize: 26, fontWeight: 700, letterSpacing: 3 }}>VS</div>
                    {playerBlock(playerB?.username ?? "Oracle", sideB, scoreB, bWins)}
                </div>

                {/* Sharpest fallacy call-out (the shareable sting) */}
                {sharpest && (
                    <div style={{ display: "flex", flexDirection: "column", marginTop: 24, padding: "16px 22px", background: "rgba(224,86,76,0.08)", border: "1px solid rgba(224,86,76,0.5)", borderRadius: 12 }}>
                        <span style={{ color: RED, fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
                            Sharpest fallacy · {sharpest.name}
                        </span>
                        {sharpest.quote && (
                            <span style={{ color: MUTED, fontSize: 22, fontStyle: "italic", marginTop: 6, display: "flex" }}>
                                “{sharpest.quote}”
                            </span>
                        )}
                    </div>
                )}

                {/* Footer: winner + url */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
                    <span style={{ color: winnerName ? GOLD_BRIGHT : DIM, fontSize: 26, fontWeight: 700, display: "flex" }}>
                        {winnerName ? `🏆 ${winnerName} carries the verdict` : "A debate without a victor"}
                    </span>
                    <span style={{ color: DIM, fontSize: 16, letterSpacing: 1 }}>argos-indol.vercel.app</span>
                </div>
            </div>
        ),
        SIZE
    );
}
