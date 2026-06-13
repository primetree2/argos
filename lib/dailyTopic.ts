import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyTopic {
    date: string;
    title: string;
    category: string | null;
}

/** UTC date as YYYY-MM-DD. */
export function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Fetch today's curated topic, or null if none generated yet. */
export async function getTodayTopic(
    supabase: SupabaseClient
): Promise<DailyTopic | null> {
    const { data } = await supabase
        .from("daily_topics")
        .select("date, title, category")
        .eq("date", todayUtc())
        .single();
    return data ?? null;
}
