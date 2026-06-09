import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("users")
        .select("elo_rating, debates_won, debates_lost, username")
        .eq("id", user.id)
        .single();

    const stats = {
        elo: profile?.elo_rating ?? 1200,
        won: profile?.debates_won ?? 0,
        lost: profile?.debates_lost ?? 0,
        username: profile?.username ?? user.email?.split("@")[0],
    };

    const totalDebates = stats.won + stats.lost;
    const winRate = totalDebates > 0 ? Math.round((stats.won / totalDebates) * 100) : 0;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* Navbar */}
            <nav className="border-b border-white/5 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[#f59e0b] font-mono font-bold">▲</span>
                    <span className="font-bold tracking-tight">ARGOS</span>
                </div>
                <div className="flex items-center gap-6">
                    <span className="text-sm text-white/30 font-mono">{stats.username}</span>
                    <form action="/auth/signout" method="post">
                        <button className="text-xs text-white/30 hover:text-white/60 transition-colors tracking-wider uppercase">
                            Sign out
                        </button>
                    </form>
                </div>
            </nav>

            <main className="max-w-3xl mx-auto px-8 py-12">
                {/* Header */}
                <div className="mb-10">
                    <p className="text-[#f59e0b] font-mono text-xs tracking-widest mb-2">DASHBOARD</p>
                    <h1 className="text-3xl font-bold tracking-tight">Welcome back.</h1>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3 mb-10">
                    {[
                        { label: "ELO RATING", value: stats.elo, mono: true, highlight: true },
                        { label: "WON", value: stats.won, mono: true, highlight: false },
                        { label: "LOST", value: stats.lost, mono: true, highlight: false },
                        { label: "WIN RATE", value: `${winRate}%`, mono: true, highlight: false },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className={`rounded-[6px] border p-5 ${stat.highlight
                                    ? "border-[#f59e0b]/30 bg-[#f59e0b]/5 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                                    : "border-white/5 bg-[#111]"
                                }`}
                        >
                            <p className="text-[10px] text-white/30 tracking-widest mb-2 font-mono">{stat.label}</p>
                            <p className={`text-2xl font-bold font-mono ${stat.highlight ? "text-[#f59e0b]" : "text-white"}`}>
                                {stat.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <p className="text-[10px] text-white/20 tracking-widest font-mono mb-3">PLAY</p>
                <div className="grid grid-cols-2 gap-3">
                    <Link
                        href="/debate/new"
                        className="group rounded-[6px] border border-[#f59e0b]/20 bg-[#f59e0b]/5 p-6 hover:border-[#f59e0b]/40 hover:bg-[#f59e0b]/10 transition-all duration-200 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                    >
                        <p className="font-semibold mb-1">New Debate</p>
                        <p className="text-xs text-white/30">Challenge someone to a ranked or casual match</p>
                    </Link>
                    <button className="group rounded-[6px] border border-white/5 bg-[#111] p-6 text-left hover:border-white/10 hover:bg-[#161616] transition-all duration-200 cursor-not-allowed opacity-50">
                        <p className="font-semibold mb-1">Browse Challenges</p>
                        <p className="text-xs text-white/30">Coming soon</p>
                    </button>
                    <button className="group rounded-[6px] border border-white/5 bg-[#111] p-6 text-left hover:border-white/10 hover:bg-[#161616] transition-all duration-200 cursor-not-allowed opacity-50">
                        <p className="font-semibold mb-1">Debate vs AI</p>
                        <p className="text-xs text-white/30">Coming soon</p>
                    </button>
                    <button className="group rounded-[6px] border border-white/5 bg-[#111] p-6 text-left hover:border-white/10 hover:bg-[#161616] transition-all duration-200 cursor-not-allowed opacity-50">
                        <p className="font-semibold mb-1">Leaderboard</p>
                        <p className="text-xs text-white/30">Coming soon</p>
                    </button>
                </div>
            </main>
        </div>
    );
}