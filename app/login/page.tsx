import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/LoginButton";

export default async function LoginPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) redirect("/dashboard");

    return (
        <div className="flex min-h-screen items-center justify-center bg-black">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur">
                <h1 className="text-4xl font-bold text-white">Argos</h1>
                <p className="mt-2 text-white/50">Chess.com for debate</p>
                <p className="mt-6 text-sm text-white/40">
                    Debate. Get judged by AI. Climb the ranks.
                </p>
                <div className="mt-8">
                    <LoginButton />
                </div>
            </div>
        </div>
    );
}