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
    // Persistent-challenge format (migration 0018; null/defaults pre-0018).
    reusable: boolean;
    rounds: number;
    blitz: boolean;
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

    // Select the persistent-challenge columns; fall back to the minimal set if
    // they don't exist yet (pre-0018), so the page renders either way.
    let rawChallenges: Array<{
        id: string; creator_id: string; status: string; created_at: string;
        reusable?: boolean; rounds?: number; blitz?: boolean;
        topics: { title: string; category: string | null } | null;
    }> | null = null;
    {
        const full = await supabase
            .from("challenges")
            .select("id, creator_id, status, created_at, reusable, rounds, blitz, topics (title, category)")
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(80);
        if (full.error) {
            const min = await supabase
                .from("challenges")
                .select("id, creator_id, status, created_at, topics (title, category)")
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(80);
            rawChallenges = (min.data as typeof rawChallenges) ?? null;
        } else {
            rawChallenges = (full.data as typeof rawChallenges) ?? null;
        }
    }

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
                reusable: c.reusable === true,
                rounds: typeof c.rounds === "number" ? c.rounds : 3,
                blitz: c.blitz === true,
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