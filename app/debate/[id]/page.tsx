import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DebateRoom } from "@/components/debate/DebateRoom";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const ogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/og?debate_id=${id}`;
    return {
        title: "Argos — AI Debate Arena",
        openGraph: {
            images: [{ url: ogUrl, width: 1200, height: 630 }],
        },
        twitter: {
            card: "summary_large_image",
            images: [ogUrl],
        },
    };
}

export default async function DebatePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const [{ data: debate, error }, { data: profile }] = await Promise.all([
        supabase
            .from("debates")
            .select(
                `
      *,
      topics (title, category),
      arguments (
        id, user_id, round_number, content, submitted_at,
        score_total, score_clarity, score_evidence, score_logic,
        score_rebuttal, fallacy_penalty, fallacies_found,
        ai_feedback, scoring_status
      )
    `
            )
            .eq("id", id)
            .order("submitted_at", { referencedTable: "arguments", ascending: true })
            .single(),
        supabase.from("users").select("username").eq("id", user.id).single(),
    ]);

    if (error || !debate) redirect("/dashboard");

    return <DebateRoom debate={debate} currentUserId={user.id} username={profile?.username ?? null} />;
}