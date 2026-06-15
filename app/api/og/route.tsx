import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";


const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const debateId = searchParams.get("debate_id");

    if (!debateId) {
        return new ImageResponse(
            (
                <div
                    style={{
                        background: "#000",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <span style={{ color: "white", fontSize: 48, fontWeight: "bold" }}>
                        Argos
                    </span>
                </div>
            ),
            { width: 1200, height: 630 }
        );
    }

    // Fetch debate data
    const { data: debate } = await serviceClient
        .from("debates")
        .select(`
      *,
      topics (title),
      arguments (user_id, score_total)
    `)
        .eq("id", debateId)
        .single();

    if (!debate) {
        return new ImageResponse(
            (
                <div
                    style={{
                        background: "#000",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <span style={{ color: "white", fontSize: 48 }}>Debate not found</span>
                </div>
            ),
            { width: 1200, height: 630 }
        );
    }

    const topicTitle =
        (debate.topics as unknown as { title?: string } | null)?.title ?? "Untitled debate";

    // Fetch player usernames
    const { data: playerA } = await serviceClient
        .from("users")
        .select("username, elo_rating")
        .eq("id", debate.player_a_id)
        .single();

    const { data: playerB } = debate.player_b_id ? await serviceClient
        .from("users")
        .select("username, elo_rating")
        .eq("id", debate.player_b_id)
        .single() : { data: null };

    // Calculate scores
    const scoreA = debate.arguments
        .filter((a: any) => a.user_id === debate.player_a_id)
        .reduce((sum: number, a: any) => sum + (a.score_total ?? 0), 0);

    const scoreB = debate.arguments
        .filter((a: any) => a.user_id === debate.player_b_id)
        .reduce((sum: number, a: any) => sum + (a.score_total ?? 0), 0);

    const winnerName =
        debate.winner_id
            ? debate.winner_id === debate.player_a_id
                ? playerA?.username
                : debate.winner_id === debate.player_b_id
                    ? playerB?.username
                    : null
            : scoreA > scoreB
                ? playerA?.username
                : scoreB > scoreA
                    ? playerB?.username
                    : null;

    return new ImageResponse(
        (
            <div
                style={{
                    background: "#0a0a0a",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    padding: "60px",
                    fontFamily: "sans-serif",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
                    <span style={{ color: "white", fontSize: 36, fontWeight: "bold", letterSpacing: "-1px" }}>
                        ARGOS
                    </span>
                    <span style={{ color: "#666", fontSize: 20, textTransform: "uppercase", letterSpacing: "2px" }}>
                        {debate.mode} debate
                    </span>
                </div>

                {/* Topic */}
                <div style={{
                    color: "white",
                    fontSize: 42,
                    fontWeight: "bold",
                    lineHeight: 1.2,
                    marginBottom: "50px",
                    maxWidth: "900px",
                }}>
                    {topicTitle}
                </div>

                {/* Scores */}
                <div style={{ display: "flex", gap: "40px", alignItems: "center", marginBottom: "40px" }}>
                    {/* Player A */}
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        background: scoreA > scoreB ? "#052e16" : "#1a1a1a",
                        border: `2px solid ${scoreA > scoreB ? "#22c55e" : "#333"}`,
                        borderRadius: "16px",
                        padding: "24px 40px",
                        flex: 1,
                    }}>
                        <span style={{ color: "#888", fontSize: 16, marginBottom: "8px" }}>
                            {playerA?.username ?? "Player A"}
                        </span>
                        <span style={{
                            color: scoreA > scoreB ? "#22c55e" : "white",
                            fontSize: 64,
                            fontWeight: "bold",
                            lineHeight: 1,
                        }}>
                            {scoreA}
                        </span>
                        <span style={{ color: "#666", fontSize: 14, marginTop: "4px" }}>points</span>
                    </div>

                    {/* VS */}
                    <div style={{ color: "#444", fontSize: 32, fontWeight: "bold" }}>VS</div>

                    {/* Player B */}
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        background: scoreB > scoreA ? "#052e16" : "#1a1a1a",
                        border: `2px solid ${scoreB > scoreA ? "#22c55e" : "#333"}`,
                        borderRadius: "16px",
                        padding: "24px 40px",
                        flex: 1,
                    }}>
                        <span style={{ color: "#888", fontSize: 16, marginBottom: "8px" }}>
                            {playerB?.username ?? "Player B"}
                        </span>
                        <span style={{
                            color: scoreB > scoreA ? "#22c55e" : "white",
                            fontSize: 64,
                            fontWeight: "bold",
                            lineHeight: 1,
                        }}>
                            {scoreB}
                        </span>
                        <span style={{ color: "#666", fontSize: 14, marginTop: "4px" }}>points</span>
                    </div>
                </div>

                {/* Winner banner */}
                {winnerName && (
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#ffffff0a",
                        border: "1px solid #333",
                        borderRadius: "12px",
                        padding: "16px 32px",
                    }}>
                        <span style={{ color: "#22c55e", fontSize: 24, fontWeight: "bold" }}>
                            🏆 {winnerName} won this debate
                        </span>
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    position: "absolute",
                    bottom: "40px",
                    right: "60px",
                    color: "#444",
                    fontSize: 16,
                }}>
                    argos-indol.vercel.app
                </div>
            </div>
        ),
        { width: 1200, height: 630 }
    );
}