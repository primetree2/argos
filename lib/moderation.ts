const BLOCKED_PATTERNS = [
    /\b(fuck|shit|bitch|asshole|cunt|nigger|faggot)\b/gi,
];

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

    if (text.trim().length < 20) {
        return {
            allowed: false,
            reason: "Argument is too short. Please write a meaningful argument.",
        };
    }

    if (text.length > 5000) {
        return {
            allowed: false,
            reason: "Argument is too long. Please keep it under 5000 characters.",
        };
    }

    return { allowed: true };
}