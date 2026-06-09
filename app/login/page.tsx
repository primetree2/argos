import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/LoginButton";

export default async function LoginPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-10">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <span className="text-[#f59e0b] font-mono text-2xl font-bold">▲</span>
                        <span className="text-white font-bold text-2xl tracking-tight">ARGOS</span>
                    </div>
                    <p className="text-white/30 text-sm">The debate arena. Ranked.</p>
                </div>

                {/* Card */}
                <div className="bg-[#111] border border-white/8 rounded-[6px] p-8">
                    <h2 className="text-lg font-semibold mb-1">Sign in to continue</h2>
                    <p className="text-white/30 text-sm mb-8">
                        Your Elo rating and debate history are tied to your account.
                    </p>
                    <LoginButton />
                </div>

                <p className="text-center text-xs text-white/20 mt-6">
                    By signing in you agree to debate respectfully.
                </p>
            </div>
        </div>
    );
}