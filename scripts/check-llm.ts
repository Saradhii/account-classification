import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const provider = createOpenAICompatible({
  name: "zai",
  baseURL: process.env.ZAI_BASE_URL!,
  apiKey: process.env.ZAI_API_KEY!,
});

const model = provider.chatModel(process.env.ZAI_MODEL!);

const schema = z.object({
  sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const email = `The hotfix window my team staffed last week was moved without anyone
telling us. Second time in six weeks. We put on-call people on those windows
and they sat there watching a window that was not happening. If a window
moves, someone emails me. That is the entire ask.`;

const { text } = await generateText({
  model,
  prompt: `Judge the sentiment of this bank customer email.

${email}

Respond with ONLY a JSON object, no prose, no code fences, matching exactly:
{"sentiment": "Positive"|"Neutral"|"Negative", "confidence": 0-1, "reason": "one sentence"}`,
});

const parsed = schema.safeParse(JSON.parse(text.replace(/```json|```/g, "").trim()));

if (!parsed.success) {
  console.error("model responded but failed schema validation:", text.slice(0, 200));
  process.exit(1);
}

console.log(`ok — sentiment=${parsed.data.sentiment} confidence=${parsed.data.confidence} served=${process.env.ZAI_MODEL}`);
