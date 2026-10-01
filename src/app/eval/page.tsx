"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunProgressPanel, RunReopenChip } from "@/components/run-progress-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RUN_BATCH_SIZE, useLiveRun } from "@/lib/use-live-run";
import { StatCard } from "@/components/stat-card";
import { outcomeFor } from "@/lib/eval";
import { labelBadgeClass, reviewBadgeClass } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format";

const AXIS = ["Positive", "Neutral", "Negative", "Mixed", "Skipped"];

export default function EvalPage() {
  const {
    state,
    error,
    running,
    runItems,
    runCancelled,
    elapsed,
    runPipelineNow,
    cancelRun,
    dismissed,
    dismissRunItems,
    reopenRunPanel,
  } = useLiveRun("eval");

  const comparison = useMemo(() => {
    if (!state) return null;
    const rows = state.gold.gold.map((entry) => {
      const result = state.run.results.find((r) => r.accountId === entry.accountId);
      const got = outcomeFor(result);
      return {
        accountId: entry.accountId,
        expected: entry.expected,
        got,
        match: got === entry.expected,
        confidence: result?.confidence ?? null,
        reviewRouting: result?.routedToReview ?? false,
        expectedRouting: entry.expectedReviewRouting ?? false,
        name: state.export.accounts.find((a) => a.id === entry.accountId)?.name ?? entry.accountId,
      };
    });

    const matrix = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.expected}|${row.got}`;
      matrix.set(key, (matrix.get(key) ?? 0) + 1);
    }

    const matches = rows.filter((row) => row.match).length;
    return { rows, matrix, matches, total: rows.length };
  }, [state]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!state || !comparison) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  const accuracy = comparison.total > 0 ? Math.round((comparison.matches / comparison.total) * 100) : 0;
  const routedToReview = comparison.rows.filter((row) => row.reviewRouting).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Evaluation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.runOrigin === "file"
              ? "demo data"
              : state.source === "live"
                ? "live run"
                : "cached demo run"}{" "}
            · {formatTimestamp(state.run.finishedAt)} · {state.run.modelUsed}
          </p>
        </div>
        <Button onClick={runPipelineNow} disabled={running}>
          {running ? (
            <>
              <Spinner /> Evaluating… {elapsed}s
            </>
          ) : (
            "Run fresh evaluation"
          )}
        </Button>
      </div>

      {runItems && !dismissed && (
        <RunProgressPanel
          items={runItems}
          batchSize={RUN_BATCH_SIZE}
          running={running}
          elapsed={elapsed}
          onClose={dismissRunItems}
          cancelled={runCancelled}
          onCancel={cancelRun}
          variant="eval"
          evalScore={comparison ? { matches: comparison.matches, total: comparison.total } : null}
        />
      )}

      {running && dismissed && (
        <RunReopenChip elapsed={elapsed} onReopen={reopenRunPanel} variant="eval" />
      )}

      {state.runOrigin === "file" && (
        <Alert>
          <AlertTitle>Viewing demo data</AlertTitle>
          <AlertDescription>
            This comparison uses the recorded run included with the app. Configure an LLM key and
            a database connection to run a fresh evaluation.
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Gold matches" value={`${comparison.matches}/${comparison.total}`} />
        <StatCard label="Accuracy" value={`${accuracy}%`} />
        <StatCard label="Mismatches" value={comparison.total - comparison.matches} />
        <StatCard label="Routed to review" value={routedToReview} />
      </dl>

      <Alert>
        <AlertTitle>What this proves, and what it does not</AlertTitle>
        <AlertDescription>
          The synthetic set is a smoke and regression test over known scenarios, not evidence of accuracy on real
          customer emails. The production answer is a stratified sample of real accounts hand-labeled by CSMs, scored
          with a confusion matrix and weighted error costs (a happy customer marked Negative is the most expensive
          mistake). That sample then becomes the ongoing regression set this page runs against.
        </AlertDescription>
      </Alert>

      <section className="space-y-2">
        <h2 className="font-medium">Confusion matrix</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">expected \ got</TableHead>
                {AXIS.map((col) => (
                  <TableHead key={col} className="text-center">{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {AXIS.map((row) => (
                <TableRow key={row}>
                  <TableCell className="font-medium">{row}</TableCell>
                  {AXIS.map((col) => {
                    const count = comparison.matrix.get(`${row}|${col}`) ?? 0;
                    const isDiagonal = row === col;
                    return (
                      <TableCell key={col} className="text-center">
                        {count > 0 ? (
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium tabular-nums ${
                              isDiagonal
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Per-account comparison</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Got</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Review routing</TableHead>
                <TableHead>Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    <Link
                      href={`/accounts/${row.accountId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{row.accountId}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={labelBadgeClass[row.expected] ?? ""}>{row.expected}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={labelBadgeClass[row.got] ?? ""}>{row.got}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.confidence !== null ? (
                      <span className="tabular-nums">{row.confidence.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.expectedRouting ? (
                      row.reviewRouting ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">routed as designed</Badge>
                      ) : (
                        <Badge variant="outline" className={reviewBadgeClass}>not routed</Badge>
                      )
                    ) : row.reviewRouting ? (
                      <Badge variant="outline">routed</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.match ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">match</Badge>
                    ) : (
                      <Badge variant="destructive">mismatch</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
