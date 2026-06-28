import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { FallacyGame } from "@/components/fallacy/FallacyGame";
import { getDailyFallacyRound, todayUtc } from "@/lib/fallacyGame";

export const metadata = {
    title: "Spot the Fallacy \u2014 Argos",
    description: "A 30-second daily trial: name the logical fallacy. Keep your streak alive.",
};

// Daily "spot the fallacy" mini-game (ROADMAP 2.4 item 4). Auth-gated like the
// rest of the app. The round is selected deterministically by UTC date so it's
// the same for everyone today and resets at 00:00 UTC. NO Gemini, NO DB.
export default async function FallacyPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: me } = await supabase
        .from("users")
        .select("username")
        .eq("id", user.id)
        .single();

    const day = todayUtc();
    const round = getDailyFallacyRound(day);

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={1.0} />
            <Navbar username={me?.username ?? null} />

            <main style={{ maxWidth: "640px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                <FallacyGame round={round} day={day} />
            </main>
        </div>
    );
}
