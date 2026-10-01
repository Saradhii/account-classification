/**
 * LLM cost model for the Account Health Signal pipeline.
 *
 * The case brief requires cost to be "known and justified", so pricing is an
 * explicit, overridable assumption rather than a buried constant. Defaults are
 * Z.ai list prices for glm-5.3 ($1.40 / $4.40 per 1M input/output tokens,
 * matching the GLM-5.2 rate card); override with ZAI_INPUT_PRICE and
 * ZAI_OUTPUT_PRICE in .env.local if your plan differs.
 */

export type TokenUsage = { input: number; output: number };

function envPrice(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function pricing() {
  return {
    inputPerMTok: envPrice("ZAI_INPUT_PRICE", 1.4),
    outputPerMTok: envPrice("ZAI_OUTPUT_PRICE", 4.4),
  };
}

export function costOf(tokens: TokenUsage): number {
  const { inputPerMTok, outputPerMTok } = pricing();
  return (tokens.input / 1_000_000) * inputPerMTok + (tokens.output / 1_000_000) * outputPerMTok;
}
