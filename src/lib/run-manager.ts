import { runPipeline } from "./pipeline";
import { persistBatch, setRunStatus, setRunEvalScore, cancelStaleRunningRuns } from "./db";
import { loadExport, loadGold } from "./data";
import { scoreAgainstGold } from "./eval";
import type { AccountResult, RunProgressItem } from "./schemas";

export type { RunProgressItem };

/** Thrown by startRun when another run is already live — callers return 409. */
export class RunAlreadyActiveError extends Error {
  constructor(public readonly existingRunId: string) {
    super("a run is already in progress");
    this.name = "RunAlreadyActiveError";
  }
}

/**
 * Server-side run orchestration.
 *
 * The run loop lives in the Node process, not the browser: clients only
 * start it, poll its per-account progress, and may request cancellation.
 * That makes a run survive page refreshes (and makes it watchable from any
 * browser or page) — the browser is just a window onto server state.
 *
 * Note: fire-and-forget background work assumes a long-lived Node server
 * (`next start`). On serverless the loop would need an external runner
 * (queue/worker) — an accepted, stated simplification for this POC.
 */

type ActiveRun = {
  runId: string;
  startedAtMs: number;
  cancelRequested: boolean;
  cancelled: boolean;
  finished: boolean;
  kind: "production" | "eval";
  items: RunProgressItem[];
};

const CONCURRENCY = 3;
const LINGER_MS = 10 * 60 * 1000;

// Module-level state: one active run at a time, kept after completion so
// late-polling clients can still render the terminal state.
const runs = new Map<string, ActiveRun>();
let currentRunId: string | null = null;

export function getActiveRun(): ActiveRun | null {
  if (!currentRunId) return null;
  const run = runs.get(currentRunId);
  if (!run) {
    currentRunId = null;
    return null;
  }
  return run;
}

export function activeRunView(): {
  runId: string;
  startedAtMs: number;
  cancelRequested: boolean;
  cancelled: boolean;
  finished: boolean;
  kind: "production" | "eval";
  items: RunProgressItem[];
} | null {
  const run = getActiveRun();
  if (!run) return null;
  return { ...run, items: run.items.map((item) => ({ ...item })) };
}

export async function startRun(
  triggeredBy: "manual" | "cron" = "manual",
  kind: "production" | "eval" = "production",
): Promise<string> {
  const existing = getActiveRun();
  if (existing && !existing.finished) {
    throw new RunAlreadyActiveError(existing.runId);
  }

  // Any 'running' rows left in Postgres without live in-memory state are
  // debris (e.g. a server crash mid-run) — mark them cancelled before starting.
  await cancelStaleRunningRuns().catch(() => undefined);

  const accounts = loadExport().accounts;
  const runId = `run-${Date.now()}`;
  const run: ActiveRun = {
    runId,
    startedAtMs: Date.now(),
    cancelRequested: false,
    cancelled: false,
    finished: false,
    kind,
    items: accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      status: "queued" as const,
    })),
  };
  runs.set(runId, run);
  currentRunId = runId;

  // Fire and forget: the HTTP response returns immediately; the loop keeps
  // running in this Node process and persists each account as it lands.
  void executeRun(run, triggeredBy).catch(async (error) => {
    console.error("run loop crashed:", error);
    run.finished = true;
    await setRunStatus(runId, "failed").catch(() => undefined);
  });

  return runId;
}

export function requestCancel(): boolean {
  const run = getActiveRun();
  if (!run || run.finished) return false;
  run.cancelRequested = true;
  return true;
}

async function executeRun(run: ActiveRun, triggeredBy: "manual" | "cron") {
  let nextIndex = 0;
  const collected: AccountResult[] = [];

  const worker = async () => {
    while (nextIndex < run.items.length) {
      if (run.cancelRequested) return;
      const index = nextIndex++;
      const item = run.items[index];
      item.status = "running";
      try {
        const batch = await runPipeline({
          concurrency: 1,
          accountIds: [item.accountId],
          runId: run.runId,
        });
        const result = batch.results[0];
        item.outcome = result?.outcome ?? null;
        item.label = result?.label ?? null;
        item.status = result?.outcome === "failed" ? "failed" : "done";
        if (result) collected.push(result);
        await persistBatch({
          run: batch,
          triggeredBy,
          totalAccounts: run.items.length,
          kind: run.kind,
        }).catch((error) => console.warn("could not persist result:", error));
      } catch (error) {
        console.warn(`assessment failed for ${item.accountId}:`, error);
        item.status = "failed";
        item.outcome = "failed";
        item.label = null;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, run.items.length) }, () => worker()));

  run.finished = true;

  // The gold score is computed once and stored — history shows what each run
  // actually scored, not what today's code would re-derive from it.
  const score = scoreAgainstGold(collected, loadGold());
  await setRunEvalScore(run.runId, score.matches, score.total).catch(() => undefined);

  if (run.cancelRequested) {
    run.cancelled = true;
    await setRunStatus(run.runId, "cancelled").catch(() => undefined);
  }
  // Completion (all accounts present) is derived inside persistBatch.

  // Keep the terminal state around for late pollers, then forget it.
  setTimeout(() => {
    if (currentRunId === run.runId) currentRunId = null;
    runs.delete(run.runId);
  }, LINGER_MS);
}
