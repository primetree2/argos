import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    // Fetch user stats
    const { data: profile } = await supabase
        .from("users")
        .select("elo_rating, debates_won, debates_lost")
        .eq("id", user.id)
        .single();

    const stats = {
        elo: profile?.elo_rating ?? 1200,
        won: profile?.debates_won ?? 0,
        lost: profile?.debates_lost ?? 0,
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold">Argos</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-white/50">{user.email}</span>
                    <form action="/auth/signout" method="post">
                        <button className="text-sm text-white/50 hover:text-white transition">
                            Sign out
                        </button>
                    </form>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <div className="mb-10">
                    <h2 className="text-3xl font-bold">Welcome back</h2>
                    <p className="mt-1 text-white/40">Ready to debate?</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-10">
                    {[
                        { label: "Elo Rating", value: stats.elo },
                        { label: "Debates Won", value: stats.won },
                        { label: "Debates Lost", value: stats.lost },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-xl border border-white/10 bg-white/5 p-6"
                        >
                            <p className="text-sm text-white/40">{stat.label}</p>
                            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-4">
                    <Link
                        href="/debate/new"
                        className="rounded-xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition block"
                    >
                        <p className="text-lg font-semibold">New Debate</p>
                        <p className="mt-1 text-sm text-white/40">
                            Start a ranked or casual debate
                        </p>
                    </Link>
                    <button className="rounded-xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
                        <p className="text-lg font-semibold">Browse Challenges</p>
                        <p className="mt-1 text-sm text-white/40">
                            Accept an open challenge
                        </p>
                    </button>
                    <button className="rounded-xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
                        <p className="text-lg font-semibold">Debate vs AI</p>
                        <p className="mt-1 text-sm text-white/40">
                            Practice against Gemini
                        </p>
                    </button>
                    <button className="rounded-xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
                        <p className="text-lg font-semibold">Leaderboard</p>
                        <p className="mt-1 text-sm text-white/40">
                            See top ranked debaters
                        </p>
                    </button>
                </div>
            </main>
        </div>
    );
}