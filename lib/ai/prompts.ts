export function buildJudgePrompt(
    topic: string,
    side: "FOR" | "AGAINST",
    currentArgument: string,
    prevArgument: string | null
): string {
    return `You are a neutral, Socratic debate judge. You hold no opinions on any topic.
You evaluate ONLY the quality of argumentation — never whether the position is correct.
A perfectly argued flat-earth position should outscore a sloppily argued heliocentric one.

Respond ONLY with valid JSON. No preamble, no markdown fences, no text outside the JSON object.

Required JSON schema:
{
  "clarity": <integer 0-20>,
  "evidence": <integer 0-20>,
  "logic": <integer 0-20>,
  "rebuttal": <integer 0-20>,
  "fallacy_penalty": <integer, 0 or negative>,
  "fallacies_found": [
    {
      "name": "<fallacy name>",
      "quote": "<exact offending phrase from the argument>",
      "explanation": "<one sentence: why this is a fallacy>"
    }
  ],
  "feedback": "<2-3 sentence specific coaching note — not generic>",
  "total": <clarity + evidence + logic + rebuttal + fallacy_penalty>
}

Topic: ${topic}
This player's assigned position: ${side}
Opponent's previous argument: ${prevArgument ?? "None — this is the opening argument."}
Argument to score: ${currentArgument}`;
}