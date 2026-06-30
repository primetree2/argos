import type { SupabaseClient } from "@supabase/supabase-js";
import { getArchetype, type Archetype, type ScoredDims } from "@/lib/ai/archetype";

// Weekly "your mind this week" recap (ROADMAP §6.2 item 6 / §5.2 force 2).
//
// The strongest ORGANIC, identity-based share artifact: it's about THEM
// (Spotify-Wrapped energy), far stickier than a single scorecard. Computed
// ENTIRELY from already-stored argument scores — NO Gemini call per view, NO new
// table/migration. Pure aggregate read, so it is cheap to render anywhere.

const DIM_LABEL: Record<"clarity" | "evidence" | "logic" | "rebuttal", string> = {
    clarity: "Clarity",
    evidence: "Evidence",
    logic: "Logic",
    rebuttal: "Rebuttal",
};

export interface WeeklyRecap {
    /** Inclusive window start (ISO) and the day count it covers. */
    since: string;
    days: number;
    /** Scored arguments the user made in the window. */
    arguments: number;
    /** Average total score (0–80) across those arguments, rounded. */
    avgScore: number;
    /** Best single argument total in the window. */
    bestScore: number;
    /** Strongest dimension this week (label) + its average value. */
    strongest: { key: "clarity" | "evidence" | "logic" | "rebuttal"; label: string; value: number };
    /** Fraction (0–100) of arguments with zero fallacies. */
    cleanRate: number;
    /** The single most-committed fallacy this week, if any. */
    topFallacy: { name: string; count: number } | null;
    /** The week's mind archetype (always present when arguments > 0). */
    archetype: Archetype;
}

interface ArgRow extends ScoredDims {
    score_total: number | null;
    fallacies_found: unknown;
}

// Compute the recap for `userId` over the last `days` days. Returns null when
// there is nothing to report (no scored arguments in the window) or on error,
// so callers render an empty state rather than a broken card.
export async function getWeeklyRecap(
    client: SupabaseClient,
    userId: string,
    days = 7
): Promise<WeeklyRecap | null> {
    try {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await client
            .from("arguments")
            .select(
                "score_total, score_clarity, score_evidence, score_logic, score_rebuttal, fallacy_penalty, fallacies_found, submitted_at"
            )
            .eq("user_id", userId)
            .eq("scoring_status", "done")
            .gte("submitted_at", since)
            .limit(500);

        if (error || !data || data.length === 0) return null;

        const rows = data as (ArgRow & { submitted_at: string })[];
        const n = rows.length;

        const sum = rows.reduce(
            (acc, r) => ({
                clarity: acc.clarity + (r.score_clarity ?? 0),
                evidence: acc.evidence + (r.score_evidence ?? 0),
                logic: acc.logic + (r.score_logic ?? 0),
                rebuttal: acc.rebuttal + (r.score_rebuttal ?? 0),
                penalty: acc.penalty + (r.fallacy_penalty ?? 0),
                total: acc.total + (r.score_total ?? 0),
            }),
            { clarity: 0, evidence: 0, logic: 0, rebuttal: 0, penalty: 0, total: 0 }
        );

        const avgDims = {
            clarity: sum.clarity / n,
            evidence: sum.evidence / n,
            logic: sum.logic / n,
            rebuttal: sum.rebuttal / n,
            fallacy_penalty: sum.penalty / n,
        };

        const archetype = getArchetype(avgDims);

        // Strongest dimension this week (ties broken by declared order).
        const dimEntries: { key: "clarity" | "evidence" | "logic" | "rebuttal"; value: number }[] = [
            { key: "clarity", value: avgDims.clarity },
            { key: "evidence", value: avgDims.evidence },
            { key: "logic", value: avgDims.logic },
            { key: "rebuttal", value: avgDims.rebuttal },
        ];
        const strongestEntry = dimEntries.reduce((a, b) => (b.value > a.value ? b : a));

        // Tally fallacies by name across the week.
        const fallacyCounts = new Map<string, number>();
        let cleanCount = 0;
        let bestScore = 0;
        for (const r of rows) {
            const total = r.score_total ?? 0;
            if (total > bestScore) bestScore = total;
            const f = r.fallacies_found;
            if (Array.isArray(f) && f.length > 0) {
                for (const item of f) {
                    const name = item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string"
                        ? (item as { name: string }).name
                        : null;
                    if (name) fallacyCounts.set(name, (fallacyCounts.get(name) ?? 0) + 1);
                }
            } else {
                cleanCount++;
            }
        }

        let topFallacy: { name: string; count: number } | null = null;
        for (const [name, count] of fallacyCounts) {
            if (!topFallacy || count > topFallacy.count) topFallacy = { name, count };
        }

        return {
            since,
            days,
            arguments: n,
            avgScore: Math.round(sum.total / n),
            bestScore,
            strongest: {
                key: strongestEntry.key,
                label: DIM_LABEL[strongestEntry.key],
                value: Math.round(strongestEntry.value * 10) / 10,
            },
            cleanRate: Math.round((cleanCount / n) * 100),
            topFallacy,
            archetype,
        };
    } catch {
        return null;
    }
}
