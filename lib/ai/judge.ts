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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = buildJudgePrompt(topic, side, currentArgument, prevArgument);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const clean = text.replace(/```json|```/g, "").trim();
            return JSON.parse(clean) as ScoreResult;
        } catch (error: any) {
            const is503 = error?.status === 503 || String(error).includes("503");
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