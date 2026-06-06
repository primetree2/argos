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
    prevArgument: string | null
): Promise<ScoreResult> {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = buildJudgePrompt(topic, side, currentArgument, prevArgument);
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ScoreResult;
}