import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DebateRoom } from "@/components/debate/DebateRoom";

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

    const { data: debate, error } = await supabase
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
        .single();

    if (error || !debate) redirect("/dashboard");

    return <DebateRoom debate={debate} currentUserId={user.id} />;
}