import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildJudgePrompt } from "./prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const prompt = buildJudgePrompt(topic, side, currentArgument, prevArgument);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const clean = text.replace(/```json|```/g, "").trim();
            const raw = JSON.parse(clean) as Partial<ScoreResult>;
            return normalizeScore(raw);
        } catch (error: any) {
            const is503 = error?.status === 503 || error?.status === 429 ||
                String(error).includes("503") || String(error).includes("429");
            const isLastAttempt = attempt === retries;

            if (is503 && !isLastAttempt) {
                const waitMs = attempt * 5000; // 5s, 10s, 15s
                console.log(`Gemini 503 — retrying in ${waitMs / 1000}s (attempt ${attempt}/${retries})`);
                await new Promise((res) => setTimeout(res, waitMs));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
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