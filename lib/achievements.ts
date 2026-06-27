// Achievements / titles / badges (ROADMAP Phase 3, FREE).
//
// Everything here is computed ON THE FLY from data the app already stores
// (Elo, win/loss counts, win rate, fallacy-free scored arguments, total
// debates). There is NO new table and NO migration — these are pure functions
// over primitives the caller has already fetched, which keeps them trivially
// testable and decoupled from Supabase.
//
// If achievements ever need to be persisted (e.g. to notify on unlock), this
// module stays the source of truth and a table can cache its output later.

export interface AchievementInput {
    elo: number;
    wins: number;
    losses: number;
    /** Total scored (terminal) arguments authored by the user. */
    scoredArguments: number;
    /** Of those, how many had zero detected fallacies. */
    fallacyFreeArguments: number;
}

export interface Title {
    label: string;
    /** CSS variable used for the accent colour. */
    color: string;
}

export interface Badge {
    id: string;
    label: string;
    description: string;
    icon: string;
    earned: boolean;
    /** CSS variable for the accent when earned. */
    color: string;
}

// ---- Titles (single, Elo-driven rank) --------------------------------------
// Ascending thresholds; the highest one the player clears is their title.
const TITLE_TIERS: { min: number; label: string; color: string }[] = [
    { min: 1800, label: "Oracle's Equal", color: "var(--gold-bright)" },
    { min: 1600, label: "Grand Rhetor", color: "var(--gold)" },
    { min: 1400, label: "Rhetorical Master", color: "var(--gold)" },
    { min: 1200, label: "Journeyman Orator", color: "var(--text-teal)" },
    { min: 1000, label: "Apprentice Debater", color: "var(--text-secondary)" },
    { min: 0, label: "Novice Debater", color: "var(--text-tertiary)" },
];

export function getTitle(elo: number): Title {
    const tier = TITLE_TIERS.find((t) => elo >= t.min) ?? TITLE_TIERS[TITLE_TIERS.length - 1];
    return { label: tier.label, color: tier.color };
}

// ---- Badges (multiple, milestone-driven) -----------------------------------
export function computeBadges(input: AchievementInput): Badge[] {
    const { elo, wins, losses, scoredArguments, fallacyFreeArguments } = input;
    const total = wins + losses;
    const winRate = total > 0 ? wins / total : 0;
    const fallacyFreeRate = scoredArguments > 0 ? fallacyFreeArguments / scoredArguments : 0;

    // Each entry: earned predicate + presentation. Ordering is roughly by
    // difficulty so earned badges cluster near the top when rendered.
    const defs: (Omit<Badge, "earned"> & { earned: boolean })[] = [
        {
            id: "first-blood",
            label: "First Blood",
            description: "Win your first debate.",
            icon: "⚔",
            color: "var(--gold)",
            earned: wins >= 1,
        },
        {
            id: "initiate",
            label: "Initiate",
            description: "Complete 5 debates.",
            icon: "◆",
            color: "var(--text-teal)",
            earned: total >= 5,
        },
        {
            id: "veteran",
            label: "Veteran",
            description: "Complete 25 debates.",
            icon: "✦",
            color: "var(--gold)",
            earned: total >= 25,
        },
        {
            id: "centurion",
            label: "Centurion",
            description: "Complete 100 debates.",
            icon: "✵",
            color: "var(--gold-bright)",
            earned: total >= 100,
        },
        {
            id: "decisive",
            label: "Decisive",
            description: "Win 10 debates.",
            icon: "↑",
            color: "var(--gold)",
            earned: wins >= 10,
        },
        {
            id: "dominant",
            label: "Dominant",
            description: "Keep a 70%+ win rate over 10+ debates.",
            icon: "▲",
            color: "var(--gold-bright)",
            earned: total >= 10 && winRate >= 0.7,
        },
        {
            id: "clean-tongue",
            label: "Clean Tongue",
            description: "Author 10 fallacy-free scored arguments.",
            icon: "○",
            color: "var(--text-teal)",
            earned: fallacyFreeArguments >= 10,
        },
        {
            id: "flawless-rhetor",
            label: "Flawless Rhetor",
            description: "90%+ of your scored arguments are fallacy-free (20+ scored).",
            icon: "⛁",
            color: "var(--gold-bright)",
            earned: scoredArguments >= 20 && fallacyFreeRate >= 0.9,
        },
        {
            id: "master",
            label: "Master Class",
            description: "Reach 1400 Elo.",
            icon: "♛",
            color: "var(--gold)",
            earned: elo >= 1400,
        },
        {
            id: "oracle-peer",
            label: "Oracle's Equal",
            description: "Reach 1800 Elo.",
            icon: "◈",
            color: "var(--gold-bright)",
            earned: elo >= 1800,
        },
    ];

    return defs;
}

/** Convenience: earned badges first, then locked, each group preserving order. */
export function sortBadgesEarnedFirst(badges: Badge[]): Badge[] {
    return [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
}
