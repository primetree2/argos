import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildJudgePrompt, buildModerationPrompt } from "./prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Primary judge model + a fallback used only when the primary is rate-limited
// or overloaded on the final attempt. The fallback is a different model so a
// per-model quota/outage doesn't fail the whole score.
const PRIMARY_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

export interface ScoreResult {
    clarity: number;
    evidence: number;
    logic: number;
    rebuttal: number;
    fallacy_penalty: number;
    fallacies_found: { name: string; quote: string; explanation: string }[];
    feedback: string;
    total: number;
}

export async function scoreArgument(
    topic: string,
    side: "FOR" | "AGAINST",
    currentArgument: string,
    prevArgument: string | null,
    retries: number = 3
): Promise<ScoreResult> {
    const prompt = buildJudgePrompt(topic, side, currentArgument, prevArgument);

    const runOnce = async (modelName: string): Promise<ScoreResult> => {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await withTimeout(
            model.generateContent(prompt),
            GEMINI_TIMEOUT_MS
        );
        const text = result.response.text();
        const clean = text.replace(/```json|```/g, "").trim();
        const raw = JSON.parse(clean) as Partial<ScoreResult>;
        return normalizeScore(raw);
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Hard per-attempt timeout. Without this a hung Gemini request would
            // keep the argument in 'scoring' until the maintenance cron requeues
            // it minutes later. A bounded timeout fails fast and deterministically
            // so the retry/finalize path runs promptly.
            return await runOnce(PRIMARY_MODEL);
        } catch (error: unknown) {
            const isRetryable = isTransient(error);
            const isLastAttempt = attempt === retries;

            if (isRetryable && !isLastAttempt) {
                const waitMs = attempt * 5000; // 5s, 10s, 15s
                console.log(`Gemini retryable error — retrying in ${waitMs / 1000}s (attempt ${attempt}/${retries})`);
                await new Promise((res) => setTimeout(res, waitMs));
                continue;
            }

            // Final attempt failed on a retryable (quota/overload/timeout) error:
            // try the fallback model once before giving up. A per-model 429 then
            // no longer fails the whole score.
            if (isRetryable && isLastAttempt) {
                try {
                    console.log(`Gemini primary exhausted — trying fallback model ${FALLBACK_MODEL}`);
                    return await runOnce(FALLBACK_MODEL);
                } catch (fallbackError) {
                    throw fallbackError;
                }
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
}

// Per-attempt ceiling for a single Gemini call.
const GEMINI_TIMEOUT_MS = 30000;

// A Gemini error is transient (worth retrying / falling back) when it is a
// quota (429), overload (503), or our own bounded timeout. Narrowed from
// `unknown` so the catch clause stays type-safe (no `any`).
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

export interface ModerationVerdict {
    allowed: boolean;
    category: string;
    reason: string;
}

// Gemini safety pass (ROADMAP Phase 1, item 3). Returns a deterministic safety
// verdict for an argument BEFORE it is accepted. Runs on the lite model with a
// shorter timeout (this sits on the submit hot path). FAIL-OPEN: any error,
// timeout, or unparseable response resolves to { allowed: true } so a Gemini
// outage never blocks legitimate play — the cheap regex/length filter in
// lib/moderation.ts remains the always-on gate.
export async function moderateWithOracle(content: string): Promise<ModerationVerdict> {
    const ALLOW: ModerationVerdict = { allowed: true, category: "none", reason: "" };
    try {
        const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
        const result = await withTimeout(
            model.generateContent(buildModerationPrompt(content)),
            15000
        );
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const raw = JSON.parse(text) as Partial<ModerationVerdict>;
        if (typeof raw.allowed !== "boolean") return ALLOW;
        return {
            allowed: raw.allowed,
            category: typeof raw.category === "string" ? raw.category : "none",
            reason:
                !raw.allowed && typeof raw.reason === "string" && raw.reason.trim()
                    ? raw.reason.trim()
                    : "This argument was flagged by safety review. Keep the debate respectful.",
        };
    } catch {
        // Fail open — do not block a legitimate user on a transient AI error.
        return ALLOW;
    }
}

// Reject with a TimeoutError if the promise doesn't settle within `ms`.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`Gemini request timed out after ${ms}ms`);
            err.name = "TimeoutError";
            reject(err);
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

// Clamp an integer into [min, max], defaulting non-numeric input to `min`.
function clampInt(value: unknown, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : min;
    return Math.max(min, Math.min(max, n));
}

/**
 * Trust the model for qualitative judgement, but never for arithmetic or
 * range. Each component is clamped to 0-20, the fallacy penalty to [-60, 0],
 * and `total` is RECOMPUTED server-side (clamped to >= 0) rather than trusting
 * the model's own sum, which can be inconsistent or out of range. score_total
 * drives the winner determination, so this must be authoritative.
 */
function normalizeScore(raw: Partial<ScoreResult>): ScoreResult {
    const clarity = clampInt(raw.clarity, 0, 20);
    const evidence = clampInt(raw.evidence, 0, 20);
    const logic = clampInt(raw.logic, 0, 20);
    const rebuttal = clampInt(raw.rebuttal, 0, 20);
    const fallacy_penalty = clampInt(raw.fallacy_penalty, -60, 0);

    const total = Math.max(
        0,
        clarity + evidence + logic + rebuttal + fallacy_penalty
    );

    const fallacies_found = Array.isArray(raw.fallacies_found)
        ? raw.fallacies_found.filter(
            (f) => f && typeof f.name === "string"
        )
        : [];

    return {
        clarity,
        evidence,
        logic,
        rebuttal,
        fallacy_penalty,
        fallacies_found,
        feedback: typeof raw.feedback === "string" ? raw.feedback : "",
        total,
    };
}