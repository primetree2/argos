import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Nav */}
      <nav className="px-8 py-5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[#f59e0b] font-mono text-lg font-bold tracking-widest">▲</span>
          <span className="text-white font-bold text-lg tracking-tight">ARGOS</span>
        </div>
        <Link
          href="/login"
          className="text-sm px-4 py-2 rounded-[6px] border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all duration-200"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] border border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[#f59e0b] text-xs font-mono mb-10 tracking-wider">
          AI-POWERED · ELO RATED · REAL-TIME
        </div>

        <h1 className="text-6xl sm:text-8xl font-bold tracking-tighter mb-4 leading-none">
          DEBATE.
          <br />
          <span className="text-white/20">RANKED.</span>
        </h1>

        <p className="text-white/40 text-base max-w-sm mb-10 leading-relaxed font-light">
          Challenge anyone. Argue your case. An AI judge scores every argument — and calls out every fallacy.
        </p>

        <Link
          href="/login"
          className="group relative bg-[#f59e0b] text-black font-bold px-8 py-3.5 rounded-[6px] hover:bg-[#fbbf24] transition-all duration-200 text-sm tracking-wide shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_40px_rgba(245,158,11,0.5)]"
        >
          START DEBATING →
        </Link>

        {/* Stats row */}
        <div className="mt-20 flex items-center gap-12 text-center">
          {[
            { value: "ELO", label: "Rating system" },
            { value: "AI", label: "Fallacy detection" },
            { value: "RT", label: "Real-time scoring" },
          ].map((s) => (
            <div key={s.label}>
              <p className="font-mono text-2xl font-bold text-[#f59e0b]">{s.value}</p>
              <p className="text-xs text-white/30 mt-1 tracking-wider uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-8 py-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-white/20 font-mono">ARGOS v1.0</span>
        <span className="text-xs text-white/20">Chess.com for debate</span>
      </footer>
    </div>
  );
}