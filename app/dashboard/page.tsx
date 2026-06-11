import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("users")
        .select("elo_rating, debates_won, debates_lost, username")
        .eq("id", user.id)
        .single();

    const elo = profile?.elo_rating ?? 1200;
    const won = profile?.debates_won ?? 0;
    const lost = profile?.debates_lost ?? 0;
    const username = profile?.username ?? user.email?.split("@")[0] ?? "Orator";
    const totalDebates = won + lost;
    const winRate = totalDebates > 0 ? Math.round((won / totalDebates) * 100) : 0;

    return (
        <DashboardClient
            elo={elo}
            won={won}
            lost={lost}
            winRate={winRate}
            totalDebates={totalDebates}
            username={username}
        />
    );
}