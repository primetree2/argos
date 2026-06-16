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
