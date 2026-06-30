// Note: no `g` flag. RegExp.test() with the global flag is stateful (advances
// lastIndex between calls on the same object), which caused intermittent
// missed/false matches across successive arguments.
const BLOCKED_PATTERNS = [
    /\b(fuck|shit|bitch|asshole|cunt|nigger|faggot)\b/i,
];

// Single source of truth for the minimum-length rule, applied IDENTICALLY on
// the client (DebateRoom) and the server (this module + the argument route).
// Previously the client required >=10 words while the server required >=20
// chars, so a 10-word/19-char argument passed the client and was rejected
// server-side. Both now use the word count as the authoritative gate.
export const MIN_WORDS = 10;
export const MAX_CHARS = 5000;

export function wordCount(text: string): number {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
}

// Topic moderation (ROADMAP Pillar 1 / R3). Topics are SHORT (a motion, not an
// argument), so the 10-word argument gate above does NOT apply — using it
// wrongly rejected legitimate short motions like "Is God real". A topic has its
// own length bounds and shares the profanity regex. The deeper Gemini safety
// pass (hate/harassment/doxxing/spam) is `moderateTopicSafety` below, kept
// separate so callers run the cheap gate first.
export const MIN_TOPIC_LEN = 8;
export const MAX_TOPIC_LEN = 300;

export function moderateTopic(text: string): {
    allowed: boolean;
    reason?: string;
} {
    const trimmed = text.trim();

    if (trimmed.length < MIN_TOPIC_LEN) {
        return {
            allowed: false,
            reason: `Topic is too short (min ${MIN_TOPIC_LEN} characters).`,
        };
    }

    if (trimmed.length > MAX_TOPIC_LEN) {
        return {
            allowed: false,
            reason: `Topic is too long (max ${MAX_TOPIC_LEN} characters).`,
        };
    }

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                allowed: false,
                reason: "That topic contains inappropriate language. Please rephrase it.",
            };
        }
    }

    return { allowed: true };
}

// Gemini safety pass for a topic. Thin wrapper over the same fail-open
// `moderateWithOracle` used on arguments, so a topic gets the SAME protection
// against hate/harassment/doxxing/spam before it hits the judge prompt, the
// public feed, or an OG share card. Fail-open (any AI error -> allowed); the
// cheap `moderateTopic` gate above remains the always-on layer. Dynamically
// imports the judge so the AI layer stays isolated to lib/ai/.
export async function moderateTopicSafety(
    text: string
): Promise<{ allowed: boolean; reason?: string }> {
    try {
        const { moderateWithOracle } = await import("@/lib/ai/judge");
        const verdict = await moderateWithOracle(text.trim());
        if (!verdict.allowed) {
            return {
                allowed: false,
                reason:
                    verdict.reason ||
                    "That topic was flagged by safety review. Please rephrase it.",
            };
        }
        return { allowed: true };
    } catch {
        // Fail open — never block topic creation on a transient AI error.
        return { allowed: true };
    }
}

export function moderateContent(text: string): {
    allowed: boolean;
    reason?: string;
} {
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(text)) {
            return {
                allowed: false,
                reason: "Your argument contains inappropriate language. Please keep the debate respectful.",
            };
        }
    }

    if (wordCount(text) < MIN_WORDS) {
        return {
            allowed: false,
            reason: `Argument is too short. Please write at least ${MIN_WORDS} words.`,
        };
    }

    if (text.length > MAX_CHARS) {
        return {
            allowed: false,
            reason: "Argument is too long. Please keep it under 5000 characters.",
        };
    }

    return { allowed: true };
}
