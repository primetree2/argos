import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { RoastClient } from "@/components/roast/RoastClient";

// Solo "roast my take" entry (ROADMAP §2.5). Auth-gated like the rest of the
// app for now; the pre-auth spectator->player funnel nudge (§2.5 force 4) is a
// later checkpoint. Server page just hydrates the client island.
export default async function RoastPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const username =
        (user.user_metadata?.username as string | undefined) ??
        (user.user_metadata?.user_name as string | undefined) ??
        (user.email ? user.email.split("@")[0] : undefined) ??
        null;

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar username={username} />
            <main style={{ maxWidth: "640px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                <RoastClient />
            </main>
        </div>
    );
}
