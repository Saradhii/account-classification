import {
  REVIEW_CONFIDENCE_THRESHOLD,
  type Account,
  type Event,
  type Task,
  type PipelineRun,
  type AccountResult,
  type Label,
} from "./schemas.ts";
import { loadExport } from "./data.ts";
import { askStructured, activeModel } from "./llm.ts";
import { toMessage } from "./utils.ts";
import {
  WINDOW_DAYS,
  assessmentSchema,
  jsonContract,
  buildPrompt,
  type Assessment,
} from "./prompt.ts";

function applyAggregationRules(
  assessment: Assessment,
  knownTaskIds: Set<string>,
  knownEventIds: Set<string>,
): {
  label: Label;
  routedToReview: boolean;
  adjustments: string[];
} {
  const adjustments: string[] = [];
  const evidence = assessment.evidence.filter((item) => {
    if (knownTaskIds.has(item.taskId)) return true;
    adjustments.push(`dropped evidence citing unknown task ${item.taskId}`);
    return false;
  });
  for (const item of assessment.eventEvidence) {
    if (!knownEventIds.has(item.eventId)) {
      adjustments.push(`dropped event evidence citing unknown event ${item.eventId}`);
    }
  }

  let label = assessment.label;
  const high = evidence.filter((item) => item.weight === "High");
  const hasHighPositive = high.some((item) => item.sentiment === "Positive");
  const hasHighNegative = high.some((item) => item.sentiment === "Negative");

  if (hasHighPositive && hasHighNegative && label !== "Mixed") {
    label = "Mixed";
    adjustments.push("high-weight positive and negative evidence both present, label set to Mixed");
  }

  let routedToReview = assessment.confidence < REVIEW_CONFIDENCE_THRESHOLD;
  if (label === "Neutral" && (hasHighPositive || hasHighNegative)) {
    routedToReview = true;
    adjustments.push("neutral label with high-weight directional evidence, routed to human review");
  }

  return { label, routedToReview, adjustments };
}

async function assessAccount(
  account: Account,
  allTasks: Task[],
  allEvents: Event[],
  runId: string,
  runDate: Date,
): Promise<AccountResult> {
  const tasks = allTasks.filter((task) => task.accountId === account.id && task.daysAgo <= WINDOW_DAYS);
  const events = allEvents.filter((event) => event.accountId === account.id && event.daysAgo <= WINDOW_DAYS);
  const automated = tasks.filter((task) => task.isAutomated);
  const human = tasks.filter((task) => !task.isAutomated);

  const base = {
    accountId: account.id,
    runId,
    priorLabel: account.currentSentiment,
    generatedAt: new Date().toISOString(),
    modelUsed: activeModel(),
  };

  if (human.length === 0 && events.length === 0) {
    return {
      ...base,
      outcome: "skipped",
      label: account.currentSentiment,
      confidence: null,
      reasoning: "No qualifying activity in the window. No LLM call, no Salesforce write; the previous label is retained and shown as stale.",
      evidence: [],
      eventEvidence: [],
      consideredMessages: 0,
      filteredAsAutomated: automated.length,
      routedToReview: false,
      salesforceWrite: "none",
      ruleAdjustments: [],
      llmMode: null,
      tokens: { input: 0, output: 0 },
    };
  }

  const prompt = buildPrompt(account, human, events, runDate);

  try {
    const { data, mode, usage } = await askStructured({
      prompt,
      schema: assessmentSchema,
      jsonContract,
    });

    const knownTaskIds = new Set(human.map((task) => task.id));
    const knownEventIds = new Set(events.map((event) => event.id));
    const { label, routedToReview, adjustments } = applyAggregationRules(
      data,
      knownTaskIds,
      knownEventIds,
    );

    const labelUnchanged = account.currentSentiment !== null && label === account.currentSentiment;

    return {
      ...base,
      outcome: "labeled",
      label,
      confidence: data.confidence,
      reasoning: data.reasoning,
      evidence: data.evidence.filter((item) => knownTaskIds.has(item.taskId)),
      eventEvidence: data.eventEvidence.filter((item) => knownEventIds.has(item.eventId)),
      consideredMessages: human.length,
      filteredAsAutomated: automated.length,
      routedToReview,
      salesforceWrite: labelUnchanged ? "unchanged" : "written",
      ruleAdjustments: adjustments,
      llmMode: mode,
      tokens: { input: usage.inputTokens, output: usage.outputTokens },
    };
  } catch (error) {
    return {
      ...base,
      outcome: "failed",
      label: null,
      confidence: null,
      reasoning: "Assessment failed. Previous label retained; account flagged for human review.",
      evidence: [],
      eventEvidence: [],
      consideredMessages: human.length,
      filteredAsAutomated: automated.length,
      routedToReview: true,
      salesforceWrite: "none",
      ruleAdjustments: [],
      llmMode: null,
      tokens: { input: 0, output: 0 },
      error: toMessage(error).slice(0, 300),
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function runPipeline(options?: {
  concurrency?: number;
  accountIds?: string[];
  runId?: string;
}): Promise<PipelineRun> {
  const startedAt = new Date();
  const runId = options?.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
  const runDate = new Date();
  const exportData = loadExport();

  const selectedAccounts = options?.accountIds
    ? exportData.accounts.filter((account) => options.accountIds!.includes(account.id))
    : exportData.accounts;

  const results = await mapWithConcurrency(
    selectedAccounts,
    options?.concurrency ?? 3,
    (account) => assessAccount(account, exportData.tasks, exportData.events, runId, runDate),
  );

  const labeled = results.filter((result) => result.outcome === "labeled");
  const failed = results.filter((result) => result.outcome === "failed");
  const writes = results.filter((result) => result.salesforceWrite === "written");

  return {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    modelUsed: activeModel(),
    results,
    summary: {
      accounts: results.length,
      labeled: labeled.length,
      skipped: results.filter((result) => result.outcome === "skipped").length,
      failed: failed.length,
      routedToReview: results.filter((result) => result.routedToReview).length,
      salesforceWrites: writes.length,
      llmCalls: labeled.length,
      filteredAutomatedMessages: results.reduce((sum, result) => sum + result.filteredAsAutomated, 0),
      tokens: {
        input: results.reduce((sum, result) => sum + result.tokens.input, 0),
        output: results.reduce((sum, result) => sum + result.tokens.output, 0),
      },
    },
  };
}
