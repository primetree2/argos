import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { authorizeAndSanitizeDebate } from "@/lib/debates/visibility";
import { DebateReplay } from "@/components/debate/DebateReplay";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return {
        title: "Argos — Debate Replay",
        openGraph: {
            images: [
                {
                    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/og?debate_id=${id}`,
                    width: 1200,
                    height: 630,
                },
            ],
        },
    };
}

// Debate replay (ROADMAP Phase 3, FREE). Reuses the completed debate's stored
// arguments + scores — no new data. Reuses authorizeAndSanitizeDebate so a
// private debate is hidden from non-participants and an in-flight (non-completed)
// debate can't be "replayed" to peek; replay is meaningful only once completed.
export default async function ReplayPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const [{ data: debate, error }, { data: profile }] = await Promise.all([
        supabase
            .from("debates")
            .select(
                `
      *,
      topics (title, category),
      arguments (
        id, user_id, round_number, content, submitted_at,
        score_total, score_clarity, score_evidence, score_logic,
        score_rebuttal, fallacy_penalty, fallacies_found,
        ai_feedback, scoring_status
      )
    `
            )
            .eq("id", id)
            .order("submitted_at", { referencedTable: "arguments", ascending: true })
            .single(),
        supabase.from("users").select("username").eq("id", user.id).single(),
    ]);

    if (error || !debate) redirect("/dashboard");

    // Authorize (visibility). On a completed debate this returns everything;
    // private debates are hidden from non-participants.
    const safeDebate = authorizeAndSanitizeDebate(debate, user.id);
    if (!safeDebate) redirect("/dashboard");

    // Replay only makes sense for a finished debate. Send a still-live debate
    // back to the live room.
    if (safeDebate.status !== "completed") redirect(`/debate/${id}`);

    // Resolve player usernames for the timeline labels.
    const playerIds = [safeDebate.player_a_id, safeDebate.player_b_id].filter(
        (v): v is string => Boolean(v)
    );
    const nameMap: Record<string, string> = {};
    if (playerIds.length > 0) {
        const { data: players } = await supabase
            .from("users")
            .select("id, username")
            .in("id", playerIds);
        for (const p of players ?? []) nameMap[p.id] = p.username;
    }

    return (
        <DebateReplay
            debate={safeDebate}
            currentUserId={user.id}
            username={profile?.username ?? null}
            nameMap={nameMap}
        />
    );
}
