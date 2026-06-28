// Daily "spot the fallacy" mini-game (ROADMAP 2.4 item 4 / 2.5 force 2).
//
// A single-player, 30-second, daily, shareable puzzle. Deliberately FREE +
// instant: a curated, hand-written round bank (no Gemini call, no DB, no
// migration). A deterministic UTC-date seed selects today's round, so:
//   - every player gets the SAME puzzle today (comparable + shareable), and
//   - it resets automatically at 00:00 UTC.
//
// The four options for every round use the EXACT fallacy taxonomy the judge
// uses (lib/ai/prompts.ts / PROJECT.md §7), so the game teaches the same
// vocabulary the real Oracle penalises.

export const FALLACY_NAMES = [
    "Ad hominem",
    "Straw man",
    "False dichotomy",
    "Appeal to authority",
    "Slippery slope",
    "Cherry picking",
    "Circular reasoning",
    "Anecdotal evidence",
    "Bandwagon",
    "Moving goalposts",
] as const;

export type FallacyName = (typeof FALLACY_NAMES)[number];

export interface FallacyRound {
    /** The statement the player inspects. */
    statement: string;
    /** The four answer choices shown (one is correct). */
    options: FallacyName[];
    /** The correct fallacy (must be one of `options`). */
    answer: FallacyName;
    /** One-sentence explanation revealed after answering. */
    explanation: string;
}

// Curated bank. Each statement clearly commits ONE of the ten fallacies. The
// options are picked to be plausibly confusable so the game is a real test.
const ROUNDS: FallacyRound[] = [
    {
        statement:
            "You can't trust anything she says about climate policy — she didn't even finish college.",
        options: ["Ad hominem", "Appeal to authority", "Straw man", "Bandwagon"],
        answer: "Ad hominem",
        explanation:
            "It attacks the person's background instead of engaging with her actual climate argument.",
    },
    {
        statement:
            "So you think we should fund the new park? I guess you just don't care about the homeless at all.",
        options: ["Straw man", "False dichotomy", "Slippery slope", "Cherry picking"],
        answer: "Straw man",
        explanation:
            "It distorts the opponent's position (fund a park) into a different, weaker one (not caring about the homeless).",
    },
    {
        statement:
            "Either we ban all cars from downtown, or the city's air will be unbreathable. There's no middle ground.",
        options: ["False dichotomy", "Slippery slope", "Straw man", "Circular reasoning"],
        answer: "False dichotomy",
        explanation:
            "It presents only two extreme options while ignoring the many realistic alternatives in between.",
    },
    {
        statement:
            "This diet must work — a famous doctor on TV endorsed it, so it has to be effective.",
        options: ["Appeal to authority", "Bandwagon", "Anecdotal evidence", "Cherry picking"],
        answer: "Appeal to authority",
        explanation:
            "It treats a celebrity endorsement as proof, rather than the actual evidence for the diet.",
    },
    {
        statement:
            "If we let students retake one exam, soon they'll demand to retake everything and grades will mean nothing.",
        options: ["Slippery slope", "False dichotomy", "Moving goalposts", "Straw man"],
        answer: "Slippery slope",
        explanation:
            "It assumes one small concession inevitably leads to an extreme outcome without justifying the chain.",
    },
    {
        statement:
            "Our product is the best — just look at these five glowing reviews (ignore the hundreds of bad ones).",
        options: ["Cherry picking", "Anecdotal evidence", "Appeal to authority", "Bandwagon"],
        answer: "Cherry picking",
        explanation:
            "It selects only the favourable data while ignoring the larger body of contrary evidence.",
    },
    {
        statement:
            "The Bible is true because it is the word of God, and we know it's the word of God because the Bible says so.",
        options: ["Circular reasoning", "Appeal to authority", "False dichotomy", "Straw man"],
        answer: "Circular reasoning",
        explanation:
            "The conclusion is used as its own premise — the argument assumes what it's trying to prove.",
    },
    {
        statement:
            "Vaccines clearly aren't safe — my cousin got one and felt sick the next day.",
        options: ["Anecdotal evidence", "Cherry picking", "Ad hominem", "Slippery slope"],
        answer: "Anecdotal evidence",
        explanation:
            "It generalises from a single personal story instead of representative data.",
    },
    {
        statement:
            "Everyone is switching to this app, so it must be the right choice for you too.",
        options: ["Bandwagon", "Appeal to authority", "False dichotomy", "Circular reasoning"],
        answer: "Bandwagon",
        explanation:
            "It argues something is correct simply because it's popular.",
    },
    {
        statement:
            "You proved he was home that night? Fine, but can you prove he wasn't on the phone planning it?",
        options: ["Moving goalposts", "Straw man", "Slippery slope", "Ad hominem"],
        answer: "Moving goalposts",
        explanation:
            "Once the original demand for evidence is met, a new, harder demand is substituted.",
    },
    {
        statement:
            "Why listen to his economic plan? He's been divorced twice — clearly he can't manage anything.",
        options: ["Ad hominem", "Straw man", "Anecdotal evidence", "Bandwagon"],
        answer: "Ad hominem",
        explanation:
            "It dismisses the plan by attacking unrelated facts about the person's private life.",
    },
    {
        statement:
            "We either adopt this software company-wide today or we accept falling behind every competitor forever.",
        options: ["False dichotomy", "Slippery slope", "Appeal to authority", "Cherry picking"],
        answer: "False dichotomy",
        explanation:
            "It frames a complex decision as only two all-or-nothing outcomes.",
    },
    {
        statement:
            "A Nobel laureate tweeted that this stock will soar, so it's a guaranteed investment.",
        options: ["Appeal to authority", "Bandwagon", "Anecdotal evidence", "Moving goalposts"],
        answer: "Appeal to authority",
        explanation:
            "Expertise in one field is borrowed as proof in an unrelated one, with no actual evidence.",
    },
    {
        statement:
            "If we allow this one mural, next it'll be graffiti everywhere and the whole town will look like a slum.",
        options: ["Slippery slope", "Straw man", "False dichotomy", "Circular reasoning"],
        answer: "Slippery slope",
        explanation:
            "It predicts a catastrophic chain of events from a single modest step without support.",
    },
    {
        statement:
            "This decision is the wisest one because only a wise person would have made it.",
        options: ["Circular reasoning", "Appeal to authority", "Bandwagon", "Straw man"],
        answer: "Circular reasoning",
        explanation:
            "The claim and its justification merely restate each other in a closed loop.",
    },
];

/** UTC date as YYYY-MM-DD. Matches lib/dailyTopic.ts. */
export function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Stable 32-bit hash of a string seed (same style as lib/ai/dailyTopic.ts). */
function hashSeed(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h;
}

/**
 * The round for a given UTC date (defaults to today). Deterministic, so every
 * player sees the same puzzle on the same day and it rotates daily.
 */
export function getDailyFallacyRound(dateSeed: string = todayUtc()): FallacyRound {
    const idx = hashSeed(dateSeed) % ROUNDS.length;
    return ROUNDS[idx];
}
