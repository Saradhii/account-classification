import { generateText, generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const providerName = process.argv[2] ?? "zai";

const providers: Record<string, { baseUrl: string; apiKey: string; model: string }> = {
  zai: {
    baseUrl: process.env.ZAI_BASE_URL ?? "",
    apiKey: process.env.ZAI_API_KEY ?? "",
    model: process.env.ZAI_MODEL ?? "glm-5.3",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY ?? "",
    model: process.env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning",
  },
};

const config = providers[providerName];
if (!config?.apiKey) {
  console.error(`unknown provider or missing key: ${providerName}`);
  process.exit(1);
}

const provider = createOpenAICompatible({
  name: providerName,
  baseURL: config.baseUrl,
  apiKey: config.apiKey,
});

const model = provider.chatModel(config.model);

const schema = z.object({
  sentiment: z.enum(["Positive", "Neutral", "Negative"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const email = `The hotfix window my team staffed last week was moved without anyone
telling us. Second time in six weeks. We put on-call people on those windows
and they sat there watching a window that was not happening. If a window
moves, someone emails me. That is the entire ask.`;

const judgePrompt = `Judge the sentiment of this bank customer email.

${email}`;

const jsonPrompt = `${judgePrompt}

Respond with ONLY a JSON object, no prose, no code fences, matching exactly:
{"sentiment": "Positive"|"Neutral"|"Negative", "confidence": 0-1, "reason": "one sentence"}`;

try {
  const native = await generateObject({ model, schema, prompt: judgePrompt });
  console.log(
    `${providerName} [${config.model}] native generateObject: OK -> ${native.object.sentiment} ${native.object.confidence} ` +
      `(tokens in=${native.usage.inputTokens} out=${native.usage.outputTokens})`,
  );
} catch (error: any) {
  console.log(`${providerName} [${config.model}] native generateObject: FAILED (${error.constructor.name})`);

  const raw = await generateText({ model, prompt: jsonPrompt });
  const stripped = raw.text.replace(/```json|```/g, "").trim();
  const parsed = schema.safeParse(JSON.parse(stripped));
  if (!parsed.success) {
    console.error(`${providerName} fallback parse failed:`, stripped.slice(0, 200));
    process.exit(1);
  }
  console.log(
    `${providerName} [${config.model}] text+parse fallback: OK -> ${parsed.data.sentiment} ${parsed.data.confidence} ` +
      `(tokens in=${raw.usage.inputTokens} out=${raw.usage.outputTokens})`,
  );
}
