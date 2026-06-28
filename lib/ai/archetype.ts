import type { ScoreResult } from "./judge";

// Mind archetype labelling (ROADMAP §2.5 force 3 — identity & labeling).
//
// A PURE function over a ScoreResult (or an aggregate of several). It assigns a
// "mind archetype" derived from the user's real score pattern — the dimension
// they lead with and the one they neglect. This is the Forer/Barnum +
// self-perception lever: once labelled, people act to confirm the label and
// broadcast it. No I/O, no Gemini call, no DB — safe to call anywhere
// (the roast route now, profiles/recaps later).

export interface ArchetypeInput {
    clarity: number;
    evidence: number;
    logic: number;
    rebuttal: number;
    fallacy_penalty: number; // 0 or negative
}

export interface Archetype {
    /** Short title, e.g. "The Logician". */
    title: string;
    /** One-line, second-person blurb tuned to the pattern. */
    blurb: string;
    /** The leading dimension key. */
    strength: "clarity" | "evidence" | "logic" | "rebuttal";
    /** The weakest dimension key (improvement hook). */
    weakness: "clarity" | "evidence" | "logic" | "rebuttal";
}

type DimKey = "clarity" | "evidence" | "logic" | "rebuttal";

const DIM_LABEL: Record<DimKey, string> = {
    clarity: "clarity",
    evidence: "evidence",
    logic: "logic",
    rebuttal: "rebuttal",
};

// Title + blurb keyed by the LEADING dimension. The blurb also nods to the
// weakness so the label feels personal and gives a reason to come back.
const PROFILE: Record<DimKey, { title: string; blurb: (weak: string) => string }> = {
    clarity: {
        title: "The Rhetorician",
        blurb: (weak) =>
            `You state your case with striking clarity — people know exactly where you stand. Sharpen your ${weak} and you become very hard to argue with.`,
    },
    evidence: {
        title: "The Empiricist",
        blurb: (weak) =>
            `You build on facts and concrete sources, not vibes. Tighten your ${weak} and the evidence will land even harder.`,
    },
    logic: {
        title: "The Logician",
        blurb: (weak) =>
            `Your reasoning is clean — conclusions follow from premises. Work on your ${weak} and few minds will keep up with yours.`,
    },
    rebuttal: {
        title: "The Closer",
        blurb: (weak) =>
            `You go straight at the other side's strongest point and dismantle it. Add more ${weak} and you'll win on substance as well as nerve.`,
    },
};

// When fallacies dominate the result, the pattern itself IS the identity.
const FALLACY_PRONE: Omit<Archetype, "strength" | "weakness"> = {
    title: "The Provocateur",
    blurb:
        "You argue with fire — but the Oracle caught the shortcuts. Cut the fallacies and that fire becomes force.",
};

// Per-argument scored row used to aggregate a profile-level archetype.
export interface ScoredDims {
    score_clarity: number | null;
    score_evidence: number | null;
    score_logic: number | null;
    score_rebuttal: number | null;
    fallacy_penalty: number | null;
}

// Aggregate a user's scored arguments into ONE archetype (ROADMAP §2.5 force 3).
//
// PURE: no I/O. Averages each dimension across all scored arguments and feeds
// the result to getArchetype. Returns null below `minSample` so the label only
// appears once it's earned (the roadmap suggests ~5 debates). getArchetype only
// compares relative magnitudes, so averaging is a faithful aggregate.
export function aggregateArchetype(
    rows: ScoredDims[],
    minSample = 5
): (Archetype & { sample: number }) | null {
    const n = rows.length;
    if (n < minSample) return null;

    const sum = rows.reduce(
        (acc, r) => ({
            clarity: acc.clarity + (r.score_clarity ?? 0),
            evidence: acc.evidence + (r.score_evidence ?? 0),
            logic: acc.logic + (r.score_logic ?? 0),
            rebuttal: acc.rebuttal + (r.score_rebuttal ?? 0),
            fallacy_penalty: acc.fallacy_penalty + (r.fallacy_penalty ?? 0),
        }),
        { clarity: 0, evidence: 0, logic: 0, rebuttal: 0, fallacy_penalty: 0 }
    );

    const avg: ArchetypeInput = {
        clarity: sum.clarity / n,
        evidence: sum.evidence / n,
        logic: sum.logic / n,
        rebuttal: sum.rebuttal / n,
        fallacy_penalty: sum.fallacy_penalty / n,
    };

    return { ...getArchetype(avg), sample: n };
}

export function getArchetype(s: ArchetypeInput): Archetype {
    const dims: { key: DimKey; value: number }[] = [
        { key: "clarity", value: s.clarity },
        { key: "evidence", value: s.evidence },
        { key: "logic", value: s.logic },
        { key: "rebuttal", value: s.rebuttal },
    ];

    // Highest = strength (ties broken by the declared order above);
    // lowest = weakness (improvement hook).
    const strongest = dims.reduce((a, b) => (b.value > a.value ? b : a));
    const weakest = dims.reduce((a, b) => (b.value < a.value ? b : a));

    const base = PROFILE[strongest.key];
    const dimTotal = s.clarity + s.evidence + s.logic + s.rebuttal;

    // Heavy fallacy penalty relative to the positive score overrides the
    // dimension archetype — the fallacies are the story.
    if (s.fallacy_penalty <= -10 && Math.abs(s.fallacy_penalty) >= dimTotal * 0.25) {
        return {
            ...FALLACY_PRONE,
            strength: strongest.key,
            weakness: weakest.key,
        };
    }

    return {
        title: base.title,
        blurb: base.blurb(DIM_LABEL[weakest.key]),
        strength: strongest.key,
        weakness: weakest.key,
    };
}
