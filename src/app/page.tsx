"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppData } from "@/lib/use-app-data";
import { labelBadgeClass, formatTimestamp } from "@/lib/ui-labels";
import type { AccountResult, PipelineRun } from "@/lib/schemas";

const BATCH_SIZE = 3;

export default function DashboardPage() {
  const { state, error, setLiveRun, clearLiveRun } = useAppData();
  const [running, setRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function runPipelineNow() {
    if (!state || running) return;
    setRunning(true);
    setRunError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const accountIds = state.export.accounts.map((account) => account.id);
      const mergedResults: AccountResult[] = state.run.results.map((result) => ({ ...result }));
      let lastRunMeta: PipelineRun | null = null;

      for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
        const batch = accountIds.slice(i, i + BATCH_SIZE);
        setProgressLabel(
          `Assessing accounts ${i + 1}–${Math.min(i + BATCH_SIZE, accountIds.length)} of ${accountIds.length}`,
        );
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountIds: batch }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error ?? `run endpoint returned ${response.status}`);
        }
        const batchRun: PipelineRun = await response.json();
        lastRunMeta = batchRun;
        for (const result of batchRun.results) {
          const index = mergedResults.findIndex((existing) => existing.accountId === result.accountId);
          if (index >= 0) mergedResults[index] = result;
          else mergedResults.push(result);
        }
      }

      if (lastRunMeta) {
        setLiveRun({ ...lastRunMeta, results: mergedResults });
      }
    } catch (err: any) {
      setRunError(String(err?.message ?? err));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgressLabel(null);
      setRunning(false);
    }
  }

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
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.run.modelUsed} · {formatTimestamp(state.run.finishedAt)} ·{" "}
            <span className={state.source === "live" ? "font-medium text-foreground" : ""}>
              {state.source === "live" ? "live run (this browser)" : "cached demo run"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.source === "live" && (
            <Button variant="outline" size="sm" onClick={clearLiveRun} disabled={running}>
              Reset to cached run
            </Button>
          )}
          <Button onClick={runPipelineNow} disabled={running}>
            {running ? `Running… ${elapsed}s` : "Run pipeline now"}
          </Button>
        </div>
      </div>

      {running && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>{progressLabel ?? "Starting…"}</span>
              <span className="text-muted-foreground">skip check and rule pre-filter run first</span>
            </div>
            <Progress value={100} />
          </CardContent>
        </Card>
      )}

      {runError && (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.accounts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.labeled} labeled · {stats.skipped} skipped · {stats.failed} failed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Review queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.review}</div>
            <p className="text-xs text-muted-foreground">confidence below 0.75 or rule flag</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Salesforce writes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.writes}</div>
            <p className="text-xs text-muted-foreground">label changes only · rest untouched</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">LLM tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{(stats.tokensIn + stats.tokensOut).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.tokensIn.toLocaleString()} in · {stats.tokensOut.toLocaleString()} out
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Filtered by rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.filtered}</div>
            <p className="text-xs text-muted-foreground">automated messages, no LLM spend</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {labelCounts.map(([label, count]) => (
          <Badge key={label} variant="outline" className={labelBadgeClass[label] ?? ""}>
            {label} · {count}
          </Badge>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="w-36">Confidence</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Write</TableHead>
                <TableHead>Review</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.run.results.map((result) => {
                const account = state.export.accounts.find((a) => a.id === result.accountId);
                return (
                  <TableRow key={result.accountId}>
                    <TableCell>
                      <div className="font-medium">{account?.name ?? result.accountId}</div>
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
                      {result.confidence !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-sm tabular-nums">{result.confidence.toFixed(2)}</span>
                          <Progress value={result.confidence * 100} className="h-1.5 w-16" />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
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
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                          needs review
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/accounts/${result.accountId}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
