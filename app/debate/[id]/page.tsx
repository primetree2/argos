import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DebateRoom } from "@/components/debate/DebateRoom";
import { authorizeAndSanitizeDebate } from "@/lib/debates/visibility";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const ogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/og?debate_id=${id}`;
    return {
        title: "Argos — AI Debate Arena",
        openGraph: {
            images: [{ url: ogUrl, width: 1200, height: 630 }],
        },
        twitter: {
            card: "summary_large_image",
            images: [ogUrl],
        },
    };
}

export default async function DebatePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Anonymous spectating: a logged-out viewer may watch a PUBLIC, in-progress
    // or completed debate read-only. We DON'T redirect them to /login here;
    // instead they are treated as a spectator (empty viewer id) below. The
    // authorize guard 404s/redirects them off private or unviewable debates,
    // and a `waiting` debate (nothing to watch yet, and joining needs auth) is
    // sent to /login so the join flow can authenticate.
    const viewerId = user?.id ?? "";

    const [{ data: debate, error }, { data: profile }] = await Promise.all([
        supabase
            .from("debates")
            .select(
                `
      *,
      topics (title, category),
      player_a:users!debates_player_a_id_fkey (username, country),
      player_b:users!debates_player_b_id_fkey (username, country),
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
        user
            ? supabase.from("users").select("username").eq("id", user.id).single()
            : Promise.resolve({ data: null as { username: string | null } | null }),
    ]);

    if (error || !debate) {
        // Logged-out viewers land on /login (so they can sign in and retry);
        // authed viewers go back to their dashboard.
        redirect(user ? "/dashboard" : "/login");
    }

    // A `waiting` debate has nothing to spectate yet, and the only action on it
    // (join) requires auth — send a logged-out viewer to sign in.
    if (!user && debate.status === "waiting") redirect("/login");

    // Authorize + redact before handing the debate to the client. A private
    // debate is hidden from non-participants; a live opponent's in-flight
    // argument is withheld from spectators until it is scored.
    const safeDebate = authorizeAndSanitizeDebate(debate, viewerId);
    if (!safeDebate) redirect(user ? "/dashboard" : "/login");

    // Surface both players' country (best-effort, may be null) so the room can
    // show a flag next to each side. The embedded relations come back as
    // single objects via the FK names; normalize to a flat shape for the client.
    type PlayerRel = { username: string | null; country: string | null } | null;
    const pa = (safeDebate as unknown as { player_a?: PlayerRel }).player_a ?? null;
    const pb = (safeDebate as unknown as { player_b?: PlayerRel }).player_b ?? null;

    return (
        <DebateRoom
            debate={safeDebate}
            currentUserId={viewerId}
            username={profile?.username ?? null}
            playerACountry={pa?.country ?? null}
            playerBCountry={pb?.country ?? null}
        />
    );
}