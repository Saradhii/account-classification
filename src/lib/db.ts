import { Pool } from "pg";
import type { PipelineRun, AccountResult } from "./schemas";

/**
 * Postgres persistence for pipeline runs (Neon).
 *
 * Only derived data is stored here: labels, confidence, reasoning and the
 * model's paraphrased evidence notes. Raw email bodies never leave the
 * Salesforce export file — see the privacy constraint in the case brief.
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  triggered_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  model_used TEXT,
  accounts INT NOT NULL DEFAULT 0,
  labeled INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  routed_to_review INT NOT NULL DEFAULT 0,
  salesforce_writes INT NOT NULL DEFAULT 0,
  llm_calls INT NOT NULL DEFAULT 0,
  filtered_automated_messages INT NOT NULL DEFAULT 0,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS run_results (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  label TEXT,
  prior_label TEXT,
  confidence REAL,
  reasoning TEXT NOT NULL,
  evidence JSONB NOT NULL,
  event_evidence JSONB NOT NULL,
  considered_messages INT NOT NULL,
  filtered_as_automated INT NOT NULL,
  routed_to_review BOOLEAN NOT NULL,
  salesforce_write TEXT NOT NULL,
  rule_adjustments JSONB NOT NULL,
  llm_mode TEXT,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  model_used TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  error TEXT,
  PRIMARY KEY (run_id, account_id)
);

CREATE INDEX IF NOT EXISTS run_results_account_idx ON run_results (account_id);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS gold_matches INT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS gold_total INT;
-- 'production' runs write labels sales acts on; 'eval' runs are engineering
-- tests scored against the gold snapshot and never feed the review queue.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'production';
`;

declare global {
  var __ahsPgPool: Pool | undefined;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!globalThis.__ahsPgPool) {
    globalThis.__ahsPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 3,
      connectionTimeoutMillis: 8000,
    });
  }
  return globalThis.__ahsPgPool;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool().query(SCHEMA_SQL).then(() => undefined);
  }
  return schemaReady;
}

/**
 * Persist one batch of a pipeline run. Reuses the runs row across batches of
 * the same runId, so a multi-batch manual run accumulates results server-side.
 *
 * A run is marked complete when the client says so (isFinal) OR when its
 * accumulated results cover every account in the export — completeness is
 * derived from data, never trusted from the browser alone.
 */
export async function persistBatch(options: {
  run: PipelineRun;
  triggeredBy: "manual" | "cron" | "demo-seed";
  isFinal?: boolean;
  totalAccounts?: number;
  kind?: "production" | "eval";
}): Promise<void> {
  const { run, triggeredBy, isFinal = false, totalAccounts = null, kind = "production" } = options;
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO runs (run_id, triggered_by, status, started_at, finished_at, model_used, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (run_id) DO UPDATE SET
         finished_at = EXCLUDED.finished_at,
         model_used = EXCLUDED.model_used,
         status = CASE
           WHEN runs.status = 'complete' THEN 'complete'
           ELSE EXCLUDED.status
         END`,
      [
        run.runId,
        triggeredBy,
        isFinal ? "complete" : "running",
        run.startedAt,
        run.finishedAt,
        run.modelUsed,
        kind,
      ],
    );

    for (const result of run.results) {
      await client.query(
        `INSERT INTO run_results (
           run_id, account_id, outcome, label, prior_label, confidence, reasoning,
           evidence, event_evidence, considered_messages, filtered_as_automated,
           routed_to_review, salesforce_write, rule_adjustments, llm_mode,
           tokens_in, tokens_out, model_used, generated_at, error
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         )
         ON CONFLICT (run_id, account_id) DO UPDATE SET
           outcome = EXCLUDED.outcome,
           label = EXCLUDED.label,
           prior_label = EXCLUDED.prior_label,
           confidence = EXCLUDED.confidence,
           reasoning = EXCLUDED.reasoning,
           evidence = EXCLUDED.evidence,
           event_evidence = EXCLUDED.event_evidence,
           considered_messages = EXCLUDED.considered_messages,
           filtered_as_automated = EXCLUDED.filtered_as_automated,
           routed_to_review = EXCLUDED.routed_to_review,
           salesforce_write = EXCLUDED.salesforce_write,
           rule_adjustments = EXCLUDED.rule_adjustments,
           llm_mode = EXCLUDED.llm_mode,
           tokens_in = EXCLUDED.tokens_in,
           tokens_out = EXCLUDED.tokens_out,
           model_used = EXCLUDED.model_used,
           generated_at = EXCLUDED.generated_at,
           error = EXCLUDED.error`,
        [
          run.runId,
          result.accountId,
          result.outcome,
          result.label,
          result.priorLabel,
          result.confidence,
          result.reasoning,
          JSON.stringify(result.evidence),
          JSON.stringify(result.eventEvidence),
          result.consideredMessages,
          result.filteredAsAutomated,
          result.routedToReview,
          result.salesforceWrite,
          JSON.stringify(result.ruleAdjustments),
          result.llmMode,
          result.tokens.input,
          result.tokens.output,
          result.modelUsed,
          result.generatedAt,
          result.error ?? null,
        ],
      );
    }

    // Summary aggregates are recomputed from the accumulated results so a
    // multi-batch run always totals correctly, and completeness is derived
    // here: covering every account in the export completes the run.
    await client.query(
      `UPDATE runs SET
         accounts = s.accounts,
         labeled = s.labeled,
         skipped = s.skipped,
         failed = s.failed,
         routed_to_review = s.routed_to_review,
         salesforce_writes = s.salesforce_writes,
         llm_calls = s.llm_calls,
         filtered_automated_messages = s.filtered,
         tokens_in = s.tokens_in,
         tokens_out = s.tokens_out,
         status = CASE
           WHEN $2 OR ($3::int IS NOT NULL AND s.accounts >= $3::int) THEN 'complete'
           ELSE runs.status
         END
       FROM (
         SELECT
           count(*)::int AS accounts,
           count(*) FILTER (WHERE outcome = 'labeled')::int AS labeled,
           count(*) FILTER (WHERE outcome = 'skipped')::int AS skipped,
           count(*) FILTER (WHERE outcome = 'failed')::int AS failed,
           count(*) FILTER (WHERE routed_to_review)::int AS routed_to_review,
           count(*) FILTER (WHERE salesforce_write = 'written')::int AS salesforce_writes,
           count(*) FILTER (WHERE llm_mode IS NOT NULL)::int AS llm_calls,
           COALESCE(sum(filtered_as_automated), 0)::int AS filtered,
           COALESCE(sum(tokens_in), 0)::int AS tokens_in,
           COALESCE(sum(tokens_out), 0)::int AS tokens_out
         FROM run_results
         WHERE run_id = $1
       ) s
       WHERE runs.run_id = $1`,
      [run.runId, isFinal, totalAccounts],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type RunRow = {
  run_id: string;
  triggered_by: string;
  status: string;
  started_at: Date;
  finished_at: Date;
  model_used: string | null;
  accounts: number;
  labeled: number;
  skipped: number;
  failed: number;
  routed_to_review: number;
  salesforce_writes: number;
  llm_calls: number;
  filtered_automated_messages: number;
  tokens_in: number;
  tokens_out: number;
  gold_matches: number | null;
  gold_total: number | null;
  kind: string;
};

type ResultRow = {
  account_id: string;
  outcome: string;
  label: string | null;
  prior_label: string | null;
  confidence: number | null;
  reasoning: string;
  evidence: AccountResult["evidence"];
  event_evidence: AccountResult["eventEvidence"];
  considered_messages: number;
  filtered_as_automated: number;
  routed_to_review: boolean;
  salesforce_write: string;
  rule_adjustments: string[];
  llm_mode: string | null;
  tokens_in: number;
  tokens_out: number;
  model_used: string;
  generated_at: Date;
  error: string | null;
};

function rowToPipelineRun(run: RunRow, results: ResultRow[]): PipelineRun {
  return {
    runId: run.run_id,
    startedAt: run.started_at.toISOString(),
    finishedAt: run.finished_at.toISOString(),
    modelUsed: run.model_used ?? results[0]?.model_used ?? "unknown",
    results: results.map((r) => ({
      accountId: r.account_id,
      runId: run.run_id,
      outcome: r.outcome as AccountResult["outcome"],
      label: (r.label as AccountResult["label"]) ?? null,
      priorLabel: (r.prior_label as AccountResult["priorLabel"]) ?? null,
      confidence: r.confidence,
      reasoning: r.reasoning,
      evidence: r.evidence,
      eventEvidence: r.event_evidence,
      consideredMessages: r.considered_messages,
      filteredAsAutomated: r.filtered_as_automated,
      routedToReview: r.routed_to_review,
      salesforceWrite: r.salesforce_write as AccountResult["salesforceWrite"],
      ruleAdjustments: r.rule_adjustments,
      llmMode: (r.llm_mode as AccountResult["llmMode"]) ?? null,
      tokens: { input: r.tokens_in, output: r.tokens_out },
      modelUsed: r.model_used,
      generatedAt: r.generated_at.toISOString(),
      ...(r.error ? { error: r.error } : {}),
    })),
    summary: {
      accounts: run.accounts,
      labeled: run.labeled,
      skipped: run.skipped,
      failed: run.failed,
      routedToReview: run.routed_to_review,
      salesforceWrites: run.salesforce_writes,
      llmCalls: run.llm_calls,
      filteredAutomatedMessages: run.filtered_automated_messages,
      tokens: { input: run.tokens_in, output: run.tokens_out },
    },
  };
}

/**
 * Latest run by start time — a run in progress outranks older complete runs.
 * With a kind filter, production views (dashboard, review queue) never fall
 * back onto eval runs; the eval page asks for eval runs but may fall back to
 * any run so it has something to score before the first eval is triggered.
 */
export async function getLatestRun(kind?: "production" | "eval"): Promise<{
  run: PipelineRun;
  triggeredBy: string;
  status: string;
  kind: string;
} | null> {
  await ensureSchema();
  const pool = getPool();
  const query = (filtered: boolean) =>
    pool.query<RunRow>(
      `SELECT * FROM runs
       ${filtered ? "WHERE kind = $1" : ""}
       ORDER BY started_at DESC, finished_at DESC
       LIMIT 1`,
      filtered ? [kind] : [],
    );
  let runRes = await query(Boolean(kind));
  if (kind && runRes.rows.length === 0) {
    runRes = await query(false);
  }
  const run = runRes.rows[0];
  if (!run) return null;
  const resultsRes = await pool.query<ResultRow>(
    `SELECT * FROM run_results WHERE run_id = $1 ORDER BY account_id`,
    [run.run_id],
  );
  return {
    run: rowToPipelineRun(run, resultsRes.rows),
    triggeredBy: run.triggered_by,
    status: run.status,
    kind: run.kind,
  };
}

export type RunListEntry = {
  runId: string;
  triggeredBy: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelUsed: string;
  accounts: number;
  labeled: number;
  skipped: number;
  failed: number;
  routedToReview: number;
  llmCalls: number;
  tokens: { input: number; output: number };
  goldMatches: number | null;
  goldTotal: number | null;
  kind: string;
};

/** Run history for the /runs page — aggregate rows only, no per-account detail. */
export async function listRuns(): Promise<RunListEntry[]> {
  await ensureSchema();
  const pool = getPool();
  const res = await pool.query<RunRow & { duration_ms: number }>(
    `SELECT *, EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 AS duration_ms
     FROM runs
     ORDER BY started_at DESC`,
  );
  return res.rows.map((row) => ({
    runId: row.run_id,
    triggeredBy: row.triggered_by,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at.toISOString(),
    durationMs: Math.round(row.duration_ms),
    modelUsed: row.model_used ?? "unknown",
    accounts: row.accounts,
    labeled: row.labeled,
    skipped: row.skipped,
    failed: row.failed,
    routedToReview: row.routed_to_review,
    llmCalls: row.llm_calls,
    tokens: { input: row.tokens_in, output: row.tokens_out },
    goldMatches: row.gold_matches,
    goldTotal: row.gold_total,
    kind: row.kind,
  }));
}

/** Reads one run's per-account results by id (used by eval-score backfill). */
export async function getRunResults(runId: string): Promise<AccountResult[]> {
  await ensureSchema();
  const pool = getPool();
  const runRes = await pool.query<RunRow>("SELECT * FROM runs WHERE run_id = $1", [runId]);
  const run = runRes.rows[0];
  if (!run) return [];
  const resultsRes = await pool.query<ResultRow>(
    "SELECT * FROM run_results WHERE run_id = $1 ORDER BY account_id",
    [runId],
  );
  return rowToPipelineRun(run, resultsRes.rows).results;
}

/** One run with its full per-account results, for the run detail page. */
export async function getRunDetail(
  runId: string,
): Promise<(RunListEntry & { results: AccountResult[] }) | null> {
  await ensureSchema();
  const pool = getPool();
  const runRes = await pool.query<RunRow & { duration_ms: number }>(
    `SELECT *, EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 AS duration_ms
     FROM runs WHERE run_id = $1`,
    [runId],
  );
  const row = runRes.rows[0];
  if (!row) return null;
  return {
    runId: row.run_id,
    triggeredBy: row.triggered_by,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at.toISOString(),
    durationMs: Math.round(row.duration_ms),
    modelUsed: row.model_used ?? "unknown",
    accounts: row.accounts,
    labeled: row.labeled,
    skipped: row.skipped,
    failed: row.failed,
    routedToReview: row.routed_to_review,
    llmCalls: row.llm_calls,
    tokens: { input: row.tokens_in, output: row.tokens_out },
    goldMatches: row.gold_matches,
    goldTotal: row.gold_total,
    kind: row.kind,
    results: await getRunResults(runId),
  };
}

export async function deleteRun(runId: string): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM runs WHERE run_id = $1", [runId]);
}

export async function setRunStatus(runId: string, status: "running" | "complete" | "cancelled" | "failed"): Promise<void> {
  await ensureSchema();
  await getPool().query("UPDATE runs SET status = $2 WHERE run_id = $1", [runId, status]);
}

/** Persisted gold-label score for a finished (or partially finished) run. */
export async function setRunEvalScore(runId: string, matches: number, total: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "UPDATE runs SET gold_matches = $2, gold_total = $3 WHERE run_id = $1",
    [runId, matches, total],
  );
}

/**
 * Safety net for runs orphaned by a server crash mid-run: any row still
 * 'running' is demoted to 'cancelled' when a new run starts. Safe because
 * startRun only calls this while no run is live in this process.
 */
export async function cancelStaleRunningRuns(): Promise<void> {
  await ensureSchema();
  await getPool().query("UPDATE runs SET status = 'cancelled' WHERE status = 'running'");
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await ensureSchema();
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
