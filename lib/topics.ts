import type { SupabaseClient } from "@supabase/supabase-js";

// Topic de-duplication helper.
//
// `topics.title` has a UNIQUE constraint (migration 0004). The SQL
// `match_player` function already reuses an existing topic via
// `insert ... on conflict (title) do nothing` + select; this mirrors that
// pattern for the app-layer routes (create debate, post challenge) so a
// repeated title NEVER throws `topics_title_unique` (e.g. Lightning seeding the
// same Daily Topic, or any two users picking the same motion).
//
// Returns the topic id plus whether THIS call created the row, so callers can
// safely clean up only a topic they actually created (never a shared/reused one).

export interface GetOrCreateTopicResult {
    id: string;
    created: boolean;
}

export async function getOrCreateTopic(
    client: SupabaseClient,
    title: string,
    opts?: { category?: string | null; source?: string }
): Promise<{ data: GetOrCreateTopicResult | null; error: string | null }> {
    const cleanTitle = title.trim();
    if (!cleanTitle) return { data: null, error: "Missing topic." };

    const category = opts?.category ?? null;
    const source = opts?.source ?? "user";

    // Insert if absent; do nothing on a title conflict. With ignoreDuplicates,
    // a conflict returns zero rows (no error), so we always SELECT afterwards
    // to resolve the canonical row whether we created it or it already existed.
    const { data: inserted, error: insertError } = await client
        .from("topics")
        .upsert(
            { title: cleanTitle, category, source },
            { onConflict: "title", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

    if (insertError) {
        return { data: null, error: insertError.message };
    }

    if (inserted?.id) {
        return { data: { id: inserted.id as string, created: true }, error: null };
    }

    // Conflict (title already existed) -> fetch the existing row.
    const { data: existing, error: selectError } = await client
        .from("topics")
        .select("id")
        .eq("title", cleanTitle)
        .single();

    if (selectError || !existing?.id) {
        return {
            data: null,
            error: selectError?.message ?? "Could not resolve topic.",
        };
    }

    return { data: { id: existing.id as string, created: false }, error: null };
}
