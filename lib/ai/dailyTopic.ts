import { GoogleGenerativeAI } from "@google/generative-ai";

// Daily Topic generator (#8). Produces a single topical, debatable, non-offensive
// motion. Falls back to a curated list if Gemini is unavailable so the daily
// cron always yields a topic.

export interface DailyTopicResult {
    title: string;
    category: string;
}

const CATEGORIES = ["Politics", "Science", "Philosophy", "Technology", "Culture"];

const FALLBACKS: DailyTopicResult[] = [
    { title: "Anonymity online does more harm than good", category: "Culture" },
    { title: "Governments should regulate artificial general intelligence", category: "Technology" },
    { title: "Meritocracy is a myth", category: "Philosophy" },
    { title: "Space colonisation is a moral imperative", category: "Science" },
    { title: "Voting should be mandatory", category: "Politics" },
    { title: "Cancel culture has gone too far", category: "Culture" },
    { title: "Privacy is more important than security", category: "Technology" },
];

function pickFallback(seed: string): DailyTopicResult {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return FALLBACKS[h % FALLBACKS.length];
}

export async function generateDailyTopic(dateSeed: string): Promise<DailyTopicResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return pickFallback(dateSeed);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        const prompt = `Generate ONE fresh, debatable motion for a competitive debate platform.

Rules:
- It must have two genuinely defensible sides.
- It must be non-offensive, not targeting any group, and safe for a general audience.
- It should feel topical and culturally relevant.
- Keep it under 12 words, phrased as a statement (not a question).
- Avoid anything that has obviously one correct answer.

Respond ONLY with valid JSON, no markdown fences:
{ "title": "<the motion>", "category": "<one of: ${CATEGORIES.join(", ")}>" }`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(text) as DailyTopicResult;

        const title = (parsed.title ?? "").trim();
        const category = CATEGORIES.includes(parsed.category) ? parsed.category : "Culture";
        if (!title || title.length < 4) return pickFallback(dateSeed);
        return { title, category };
    } catch (e) {
        console.error("generateDailyTopic error:", e);
        return pickFallback(dateSeed);
    }
}
