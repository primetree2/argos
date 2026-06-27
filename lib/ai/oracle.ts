import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildOraclePrompt } from "./prompts";

// vs Oracle AI mode (ROADMAP Phase 1, item 2).
//
// This is the ONLY new place Gemini is called for *arguing* (the judge in
// judge.ts is the only place it is called for *scoring*). Keeping the argue
// layer here preserves the guardrail: provider swaps stay isolated to lib/ai/.
//
// The Oracle plays the side OPPOSITE the human. It is never trusted for
// scoring — its arguments are scored by the same neutral judge as the human's.

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Reuse the same lite models as the judge so vs-AI debates stay inside the
// Gemini free tier. Primary + a different fallback model for per-model outage.
const PRIMARY_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

// Fixed system-user UUID seeded by migration 0006_oracle_user.sql. Do NOT
// change without updating that migration. Used as player_b_id for every
// vs-AI debate and as the author of the Oracle's arguments.
export const ORACLE_USER_ID = "00000000-0000-0000-0000-0000000000a1";

// Per-attempt ceiling for a single Gemini argue call.
const GEMINI_TIMEOUT_MS = 30000;

export interface OracleHistoryEntry {
    side: "FOR" | "AGAINST";
    content: string;
}

// Generate the Oracle's next argument for `side` of `topic`, given the
// transcript so far. Mirrors scoreArgument's resilience: bounded timeout,
// retries on transient errors, one fallback-model attempt. Returns plain text
// (an argument), never JSON.
export async function argueAsOracle(
    topic: string,
    side: "FOR" | "AGAINST",
    history: OracleHistoryEntry[],
    round: number,
    totalRounds: number,
    retries: number = 3
): Promise<string> {
    const prompt = buildOraclePrompt(topic, side, history, round, totalRounds);

    const runOnce = async (modelName: string): Promise<string> => {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await withTimeout(
            model.generateContent(prompt),
            GEMINI_TIMEOUT_MS
        );
        return sanitize(result.response.text());
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await runOnce(PRIMARY_MODEL);
        } catch (error: unknown) {
            const isRetryable = isTransient(error);
            const isLastAttempt = attempt === retries;

            if (isRetryable && !isLastAttempt) {
                const waitMs = attempt * 5000; // 5s, 10s, 15s
                await new Promise((res) => setTimeout(res, waitMs));
                continue;
            }
            if (isRetryable && isLastAttempt) {
                return await runOnce(FALLBACK_MODEL);
            }
            throw error;
        }
    }
    throw new Error("Oracle argue: max retries exceeded");
}

function isTransient(error: unknown): boolean {
    const e = error as { status?: number; name?: string } | undefined;
    return (
        e?.status === 503 ||
        e?.status === 429 ||
        e?.name === "TimeoutError" ||
        String(error).includes("503") ||
        String(error).includes("429") ||
        String(error).includes("timed out")
    );
}

// Strip stray markdown fences / surrounding quotes and clamp length so a
// runaway model response can't blow past the argument MAX_CHARS gate.
function sanitize(text: string): string {
    let t = text.replace(/```[a-z]*|```/gi, "").trim();
    if (t.startsWith("\"") && t.endsWith("\"")) t = t.slice(1, -1).trim();
    if (t.length > 4800) t = t.slice(0, 4800).trim();
    return t;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`Oracle request timed out after ${ms}ms`);
            err.name = "TimeoutError";
            reject(err);
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}
