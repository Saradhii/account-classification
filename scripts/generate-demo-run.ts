import { writeFileSync } from "node:fs";
import path from "node:path";
import { runPipeline } from "../src/lib/pipeline.ts";
import { loadGold } from "../src/lib/data.ts";
import type { PipelineRun } from "../src/lib/schemas.ts";

const run: PipelineRun = await runPipeline({ concurrency: 3 });

writeFileSync(
  path.join(process.cwd(), "data", "demo-run.json"),
  JSON.stringify(run, null, 2),
);

const gold = loadGold();

console.log(`run ${run.runId} — model ${run.modelUsed}`);
console.log(
  `labeled ${run.summary.labeled}, skipped ${run.summary.skipped}, failed ${run.summary.failed}, ` +
    `review queue ${run.summary.routedToReview}, salesforce writes ${run.summary.salesforceWrites}`,
);
console.log(
  `tokens: ${run.summary.tokens.input} in / ${run.summary.tokens.output} out, ` +
    `${run.summary.filteredAutomatedMessages} automated messages filtered by rules`,
);

const byAccount = new Map(run.results.map((result) => [result.accountId, result]));
let matches = 0;

console.log("\ngold comparison:");
for (const entry of gold.gold) {
  const result = byAccount.get(entry.accountId);
  if (!result) {
    console.log(`  ${entry.accountId}: MISSING FROM RUN`);
    continue;
  }
  const got = result.outcome === "skipped" ? "Skipped" : result.outcome === "failed" ? "Failed" : result.label;
  const match = got === entry.expected;
  if (match) matches += 1;
  const flags = [
    entry.expectedReviewRouting ? `review-routing=${result.routedToReview}` : null,
    result.ruleAdjustments.length > 0 ? `rules: ${result.ruleAdjustments.join("; ")}` : null,
  ].filter(Boolean).join(", ");
  console.log(
    `  ${result.accountId.padEnd(16)} expected ${entry.expected.padEnd(8)} got ${String(got).padEnd(8)} ` +
      `${match ? "match" : "MISMATCH"} conf=${result.confidence ?? "-"} ${flags}`,
  );
}

console.log(`\n${matches}/${gold.gold.length} gold matches`);
for (const result of run.results) {
  if (result.outcome === "failed") {
    console.log(`FAILED ${result.accountId}: ${result.error}`);
  }
}
