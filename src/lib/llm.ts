import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { z } from "zod";

export type AskResult<T> = {
  data: T;
  mode: "native" | "fallback";
  usage: { inputTokens: number; outputTokens: number };
};

const provider = createOpenAICompatible({
  name: "zai",
  baseURL: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4",
  apiKey: process.env.ZAI_API_KEY ?? "",
});

export function activeModel(): string {
  return process.env.ZAI_MODEL ?? "glm-5.3";
}

/** Whether an LLM key is configured, so run endpoints can fail fast. */
export function hasLlmKey(): boolean {
  return Boolean(process.env.ZAI_API_KEY);
}

const model = provider.chatModel(activeModel());

function stripFences(text: string): string {
  return text.replace(/```json|```/g, "").trim();
}

export async function askStructured<T>(options: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonContract: string;
}): Promise<AskResult<T>> {
  try {
    const result = await generateText({
      model,
      temperature: 0,
      output: Output.object({ schema: options.schema }),
      prompt: options.prompt,
    });
    return {
      data: result.output,
      mode: "native",
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
  } catch {
    return askViaStrictJson(options);
  }
}

async function askViaStrictJson<T>(options: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonContract: string;
}): Promise<AskResult<T>> {
  const strictPrompt = `${options.prompt}

Respond with ONLY a JSON object with EXACTLY these keys and no others, no prose, no code fences:
${options.jsonContract}`;

  const first = await generateText({ model, temperature: 0, prompt: strictPrompt });
  const firstParsed = parseWithSchema(first.text, options.schema);
  if (firstParsed !== null) {
    return withUsage(firstParsed, "fallback", first.usage.inputTokens ?? 0, first.usage.outputTokens ?? 0);
  }

  const repair = await generateText({
    model,
    temperature: 0,
    prompt: `Your previous response was not valid for the required JSON format.
Reply again with ONLY the corrected JSON object, no prose, no code fences, exactly matching:
${options.jsonContract}

Your previous response was:
${first.text.slice(0, 2000)}`,
  });
  const repaired = parseWithSchema(repair.text, options.schema);
  if (repaired !== null) {
    const input = (first.usage.inputTokens ?? 0) + (repair.usage.inputTokens ?? 0);
    const output = (first.usage.outputTokens ?? 0) + (repair.usage.outputTokens ?? 0);
    return withUsage(repaired, "fallback", input, output);
  }

  throw new Error(`model never returned schema-valid JSON (last response: ${repair.text.slice(0, 200)})`);
}

function parseWithSchema<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const json = JSON.parse(stripFences(text));
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function withUsage<T>(data: T, mode: "native" | "fallback", inputTokens: number, outputTokens: number): AskResult<T> {
  return { data, mode, usage: { inputTokens, outputTokens } };
}
