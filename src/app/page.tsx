"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { RunProgressPanel, RunReopenChip } from "@/components/run-progress-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatCard, ConfidenceCell } from "@/components/stat-card";
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
import { labelBadgeClass, reviewBadgeClass } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format";

export default function DashboardPage() {
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
  } = useLiveRun();

  // Recomputed from results, not run.summary: during a live run the
  // persisted summary lags behind the streamed-in results.
  const stats = useMemo(() => {
    if (!state) return null;
    const results = state.run.results;
    return {
      accounts: results.length,
      labeled: results.filter((r) => r.outcome === "labeled").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      review: results.filter((r) => r.routedToReview).length,
      writes: results.filter((r) => r.salesforceWrite === "written").length,
      tokensIn: results.reduce((sum, r) => sum + r.tokens.input, 0),
      tokensOut: results.reduce((sum, r) => sum + r.tokens.output, 0),
      filtered: results.reduce((sum, r) => sum + r.filteredAsAutomated, 0),
    };
  }, [state]);

  const labelCounts = useMemo(() => {
    if (!state) return [];
    const counts = new Map<string, number>();
    for (const result of state.run.results) {
      const key =
        result.outcome === "labeled"
          ? result.label ?? "Unknown"
          : result.outcome === "skipped"
            ? "Skipped"
            : "Failed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [state]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!state || !stats) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.run.modelUsed} · {formatTimestamp(state.run.finishedAt)} ·{" "}
            <span className={state.source === "live" ? "text-foreground" : ""}>
              {state.runOrigin === "file"
                ? "demo data"
                : state.source === "live"
                  ? state.runStatus === "cancelled"
                    ? "cancelled run · partial results"
                    : state.runStatus === "running"
                      ? "live run · in progress"
                      : "live run"
                  : "cached demo run"}
            </span>
          </p>
        </div>
        <Button onClick={runPipelineNow} disabled={running}>
          {running ? (
            <>
              <Spinner /> Assessing… {elapsed}s
            </>
          ) : (
            "Run assessment"
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
        />
      )}

      {running && dismissed && <RunReopenChip elapsed={elapsed} onReopen={reopenRunPanel} />}

      {state.runOrigin === "file" && (
        <Alert>
          <AlertTitle>Viewing demo data</AlertTitle>
          <AlertDescription>
            This is a recorded run included with the app, so everything works without any setup.
            Configure an LLM key and a database connection to assess accounts live.
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Accounts" value={stats.accounts} />
        <StatCard
          label="Review queue"
          value={stats.review}
          hint="confidence below 0.75 or rule flag"
        />
        <StatCard
          label="Salesforce writes"
          value={stats.writes}
          hint="label changes only · rest untouched"
        />
        <StatCard
          label="LLM tokens"
          value={(stats.tokensIn + stats.tokensOut).toLocaleString()}
          hint={`${stats.tokensIn.toLocaleString()} in · ${stats.tokensOut.toLocaleString()} out`}
        />
        <StatCard
          label="Filtered by rules"
          value={stats.filtered}
          hint="automated messages, no LLM spend"
        />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        {labelCounts.map(([label, count]) => (
          <Badge key={label} variant="outline" className={labelBadgeClass[label] ?? ""}>
            {label} · {count}
          </Badge>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-36">Confidence</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead>Write</TableHead>
              <TableHead>Review</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.run.results.map((result) => {
              const account = state.export.accounts.find((a) => a.id === result.accountId);
              return (
                <TableRow key={result.accountId}>
                  <TableCell>
                    <Link
                      href={`/accounts/${result.accountId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {account?.name ?? result.accountId}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {account?.type} · {account?.region} · {account?.tier}
                    </div>
                  </TableCell>
                  <TableCell>
                    {result.outcome === "labeled" && result.label ? (
                      <Badge variant="outline" className={labelBadgeClass[result.label] ?? ""}>
                        {result.label}
                      </Badge>
                    ) : result.outcome === "skipped" ? (
                      <Badge variant="outline">Skipped</Badge>
                    ) : (
                      <Badge variant="destructive">Failed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ConfidenceCell confidence={result.confidence} />
                  </TableCell>
                  <TableCell>
                    {result.outcome === "skipped" ? (
                      <span className="text-sm text-muted-foreground">stale · no activity</span>
                    ) : result.priorLabel ? (
                      <span className="text-sm">
                        {result.priorLabel} → <span className="font-medium">{result.label}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">first label</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {result.salesforceWrite === "written"
                        ? "written"
                        : result.salesforceWrite === "unchanged"
                          ? "unchanged"
                          : "none"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {result.routedToReview ? (
                      <Badge variant="outline" className={reviewBadgeClass}>
                        needs review
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/accounts/${result.accountId}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
