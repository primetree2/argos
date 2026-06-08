import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-5 flex items-center justify-between border-b border-white/10">
        <span className="text-xl font-bold tracking-tight">Argos</span>
        <Link
          href="/login"
          className="text-sm px-4 py-2 rounded-lg border border-white/20 hover:bg-white/10 transition"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/50 mb-8">
          ⚡ AI-powered debate scoring
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-none">
          Chess.com
          <br />
          <span className="text-white/40">for debate.</span>
        </h1>

        <p className="text-white/50 text-lg max-w-md mb-10 leading-relaxed">
          Challenge anyone to a debate. An AI judge scores your arguments on
          clarity, evidence, and logic — and calls out every fallacy.
        </p>

        <Link
          href="/login"
          className="bg-white text-black font-semibold px-8 py-4 rounded-xl hover:bg-white/90 transition text-lg"
        >
          Start Debating →
        </Link>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-3">
          {[
            "🏆 Elo ratings",
            "🤖 AI fallacy detection",
            "⚡ Real-time scoring",
            "📊 Argument breakdown",
            "🎯 Ranked matches",
          ].map((f) => (
            <span
              key={f}
              className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-white/50"
            >
              {f}
            </span>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/10 text-center text-xs text-white/20">
        Argos — debate smarter
      </footer>
    </div>
  );
}