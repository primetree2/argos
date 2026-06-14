import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { ChallengeLobby } from "@/components/challenges/ChallengeLobby";

export const metadata = {
    title: "Open Challenges — Argos",
    description: "Post a debate challenge or accept one. No invite needed.",
};

export const dynamic = "force-dynamic";

export interface OpenChallenge {
    id: string;
    topicTitle: string;
    category: string | null;
    creator: string | null;
    creatorElo: number | null;
    isMine: boolean;
    createdAt: string | null;
}

export default async function ChallengesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: me } = await supabase
        .from("users")
        .select("username")
        .eq("id", user.id)
        .single();

    const { data: rawChallenges } = await supabase
        .from("challenges")
        .select("id, creator_id, status, created_at, topics (title, category)")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(80);

    const challenges: OpenChallenge[] = [];
    if (rawChallenges && rawChallenges.length > 0) {
        const creatorIds = Array.from(
            new Set(
                rawChallenges
                    .map((c) => c.creator_id)
                    .filter((cid): cid is string => Boolean(cid))
            )
        );
        const creatorMap = new Map<string, { username: string; elo: number | null }>();
        if (creatorIds.length > 0) {
            const { data: creators } = await supabase
                .from("users")
                .select("id, username, elo_rating")
                .in("id", creatorIds);
            for (const c of creators ?? []) {
                creatorMap.set(c.id, { username: c.username, elo: c.elo_rating });
            }
        }

        for (const c of rawChallenges) {
            const topic = c.topics as unknown as { title: string; category: string | null } | null;
            const creator = c.creator_id ? creatorMap.get(c.creator_id) ?? null : null;
            challenges.push({
                id: c.id,
                topicTitle: topic?.title ?? "Unknown topic",
                category: topic?.category ?? null,
                creator: creator?.username ?? null,
                creatorElo: creator?.elo ?? null,
                isMine: c.creator_id === user.id,
                createdAt: c.created_at,
            });
        }
    }

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={me?.username ?? null} />

            <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                <ChallengeLobby
                    challenges={challenges}
                    currentUserId={user.id}
                />
            </main>
        </div>
    );
}