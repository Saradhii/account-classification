import { generateText, Output } from "ai";
import { xai } from "@ai-sdk/xai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const which = process.argv[2] ?? "zai";

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

if (which === "xai") {
  if (!process.env.XAI_API_KEY) {
    console.error("XAI_API_KEY is not set (currently commented out in .env.local)");
    process.exit(1);
  }
  const result = await generateText({
    model: xai(process.env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning"),
    output: Output.object({ schema }),
    prompt: judgePrompt,
  });
  console.log(
    `xai [${process.env.XAI_MODEL}] Output.object: OK -> ${result.output.sentiment} ${result.output.confidence}`,
  );
} else if (which === "zai") {
  const provider = createOpenAICompatible({
    name: "zai",
    baseURL: process.env.ZAI_BASE_URL ?? "",
    apiKey: process.env.ZAI_API_KEY ?? "",
  });
  const model = provider.chatModel(process.env.ZAI_MODEL ?? "glm-5.3");

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema }),
      prompt: judgePrompt,
    });
    console.log(`zai [${process.env.ZAI_MODEL}] Output.object: OK -> ${result.output.sentiment} ${result.output.confidence}`);
  } catch (error: any) {
    console.log(`zai [${process.env.ZAI_MODEL}] Output.object: FAILED (${error.constructor.name}), using strict JSON fallback`);
    const raw = await generateText({
      model,
      prompt: `${judgePrompt}

Respond with ONLY a JSON object with EXACTLY these keys and no others:
{"sentiment": one of "Positive", "Neutral", "Negative", "confidence": number 0-1, "reason": one sentence}`,
    });
    const parsed = schema.safeParse(JSON.parse(raw.text.replace(/```json|```/g, "").trim()));
    console.log(
      parsed.success
        ? `zai fallback text+parse: OK -> ${parsed.data.sentiment} ${parsed.data.confidence}`
        : "zai fallback text+parse: FAILED",
    );
    if (!parsed.success) process.exit(1);
  }
} else {
  console.error(`unknown provider: ${which} (expected "zai" or "xai")`);
  process.exit(1);
}
