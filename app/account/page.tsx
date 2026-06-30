import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";
import { DeleteAccount } from "@/components/account/DeleteAccount";

export const metadata = {
    title: "Account — Argos",
    description: "Manage your Argos account.",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("users")
        .select("username, email")
        .eq("id", user.id)
        .single();

    const username = profile?.username ?? null;

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
            <CircuitBackground intensity={0.7} />
            <Navbar username={username} />

            <main style={{ maxWidth: "640px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
                {/* Header */}
                <div className="reveal-1" style={{ marginBottom: "2.5rem" }}>
                    <p style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.65rem", letterSpacing: "0.28em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
                        ◆ Account
                    </p>
                    <h1 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.15 }}>
                        Your <span style={{ color: "var(--text-gold)" }}>Account</span>
                    </h1>
                    <div style={{ marginTop: "0.85rem", height: "1px", width: "120px", background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-border) 60%, transparent 100%)" }} />
                </div>

                {/* Identity card */}
                <div className="reveal-2 glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                    <p style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--text-gold)", textTransform: "uppercase", marginBottom: "0.9rem" }}>
                        Identity
                    </p>
                    <Field label="Orator" value={profile?.username ?? "—"} />
                    <Field label="Email" value={profile?.email ?? user.email ?? "—"} />
                    {username && (
                        <Link
                            href={`/profile/${encodeURIComponent(username)}`}
                            className="btn-ghost"
                            style={{ marginTop: "1rem", display: "inline-block", fontSize: "0.7rem", letterSpacing: "0.14em", padding: "0.6rem 1.1rem", textDecoration: "none" }}
                        >
                            View public profile →
                        </Link>
                    )}
                </div>

                {/* Danger zone */}
                <div className="reveal-3">
                    <DeleteAccount />
                </div>
            </main>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "0.58rem", letterSpacing: "0.18em", color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                {label}
            </span>
            <span style={{ fontFamily: "var(--font-share-tech), monospace", fontSize: "0.85rem", color: "var(--text-secondary)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {value}
            </span>
        </div>
    );
}
