import type { AccountResult, GoldFile } from "./schemas";

/**
 * Gold-label evaluation, shared by the eval page (per-row detail) and the
 * server (persisted score per run). One definition so the number shown in
 * the UI and the number stored in Postgres can never drift apart.
 */

export function outcomeFor(result: AccountResult | undefined): string {
  if (!result) return "Missing";
  if (result.outcome === "skipped") return "Skipped";
  if (result.outcome === "failed") return "Failed";
  return result.label ?? "Unknown";
}

export function scoreAgainstGold(
  results: AccountResult[],
  gold: GoldFile,
): { matches: number; total: number } {
  let matches = 0;
  for (const entry of gold.gold) {
    const result = results.find((r) => r.accountId === entry.accountId);
    if (outcomeFor(result) === entry.expected) matches++;
  }
  return { matches, total: gold.gold.length };
}
