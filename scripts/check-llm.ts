import { generateText, Output } from "ai";
import { xai } from "@ai-sdk/xai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

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

const grokModel = xai(process.env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning");

const grokResult = await generateText({
  model: grokModel,
  output: Output.object({ schema }),
  prompt: judgePrompt,
});

console.log(
  `xai [${process.env.XAI_MODEL}] Output.object: OK -> ${grokResult.output.sentiment} ${grokResult.output.confidence} ` +
    `(tokens in=${grokResult.usage.inputTokens} out=${grokResult.usage.outputTokens})`,
);

const zaiProvider = createOpenAICompatible({
  name: "zai",
  baseURL: process.env.ZAI_BASE_URL ?? "",
  apiKey: process.env.ZAI_API_KEY ?? "",
});

const glmModel = zaiProvider.chatModel(process.env.ZAI_MODEL ?? "glm-5.3");

try {
  const glmResult = await generateText({
    model: glmModel,
    output: Output.object({ schema }),
    prompt: judgePrompt,
  });
  console.log(
    `zai [${process.env.ZAI_MODEL}] Output.object: OK -> ${glmResult.output.sentiment} ${glmResult.output.confidence} ` +
      `(tokens in=${glmResult.usage.inputTokens} out=${glmResult.usage.outputTokens})`,
  );
} catch (error: any) {
  console.log(`zai [${process.env.ZAI_MODEL}] Output.object: FAILED (${error.constructor.name})`);
  const raw = await generateText({
    model: glmModel,
    prompt: `${judgePrompt}

Respond with ONLY a JSON object with EXACTLY these keys and no others:
{"sentiment": one of "Positive", "Neutral", "Negative", "confidence": number 0-1, "reason": one sentence}`,
  });
  const parsed = schema.safeParse(JSON.parse(raw.text.replace(/```json|```/g, "").trim()));
  console.log(
    parsed.success
      ? `zai fallback text+parse: OK -> ${parsed.data.sentiment} ${parsed.data.confidence}`
      : `zai fallback text+parse: FAILED`,
  );
}
