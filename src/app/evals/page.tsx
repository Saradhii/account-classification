"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { StatCard } from "@/components/stat-card";
import { fmtUsd, fmtDuration, formatTimestamp } from "@/lib/format";
import type { RunListEntry } from "@/lib/db";

/** What /api/runs returns: the server's run row plus the computed cost. */
type HistoryRow = RunListEntry & { costUsd: number };

type EvalsResponse = {
  runs: HistoryRow[];
  pricing: { inputPerMTok: number; outputPerMTok: number };
};

function accuracy(matches: number | null, total: number | null): number | null {
  if (matches === null || total === null || total === 0) return null;
  return Math.round((matches / total) * 100);
}

/**
 * History of eval runs: engineering replays of the production pipeline
 * against the frozen, human-verified gold snapshot. These never feed the
 * review queue or anything sales sees.
 */
export default function EvalsPage() {
  const [data, setData] = useState<EvalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs?kind=eval")
      .then(async (response) => {
        if (!response.ok) throw new Error(`evals endpoint returned ${response.status}`);
        return response.json();
      })
      .then((body: EvalsResponse) => setData(body))
      .catch((err) => setError(String(err?.message ?? err)));
  }, []);

  const totals = useMemo(() => {
    if (!data || data.runs.length === 0) return null;
    const scored = data.runs.filter((run) => run.goldTotal !== null && run.goldMatches !== null);
    const matchSum = scored.reduce((sum, run) => sum + (run.goldMatches ?? 0), 0);
    const totalSum = scored.reduce((sum, run) => sum + (run.goldTotal ?? 0), 0);
    const latest = scored[0];
    return {
      runs: data.runs.length,
      avgAccuracy: totalSum > 0 ? Math.round((matchSum / totalSum) * 100) : null,
      latestAccuracy: accuracy(latest?.goldMatches ?? null, latest?.goldTotal ?? null),
      totalSpend: data.runs.reduce((sum, run) => sum + run.costUsd, 0),
      avgDuration:
        data.runs.reduce((sum, run) => sum + run.durationMs, 0) / data.runs.length,
    };
  }, [data]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load eval history</AlertTitle>
        <AlertDescription>
          {error}. Eval history needs a database connection.
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || !totals) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Evals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Engineering replays of the pipeline against the human-verified gold snapshot. They are
          scored, priced, and never shown to sales. Run one from the{" "}
          <a href="/eval" className="underline underline-offset-4 hover:text-foreground">
            Evaluation
          </a>{" "}
          page.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Evals recorded" value={totals.runs} />
        <StatCard
          label="Avg gold accuracy"
          value={totals.avgAccuracy !== null ? `${totals.avgAccuracy}%` : "—"}
        />
        <StatCard
          label="Latest eval"
          value={totals.latestAccuracy !== null ? `${totals.latestAccuracy}%` : "—"}
        />
        <StatCard
          label="Total eval spend"
          value={fmtUsd(totals.totalSpend)}
          hint={`avg ${fmtDuration(totals.avgDuration)} per eval`}
        />
      </dl>

      {data.runs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No eval runs yet. Trigger one with “Run fresh evaluation” on the Evaluation page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Eval</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Gold matches</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="text-right">Tokens (in / out)</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.map((run) => {
                const acc = accuracy(run.goldMatches, run.goldTotal);
                return (
                  <TableRow key={run.runId}>
                    <TableCell className="max-w-44">
                      <Link
                        href={`/runs/${run.runId}`}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {run.runId}
                      </Link>
                      <div className="text-xs text-muted-foreground">{run.modelUsed}</div>
                    </TableCell>
                    <TableCell>
                      {run.status === "complete" ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        >
                          complete
                        </Badge>
                      ) : run.status === "running" ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        >
                          running
                        </Badge>
                      ) : run.status === "cancelled" ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          cancelled
                        </Badge>
                      ) : (
                        <Badge variant="destructive">{run.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTimestamp(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {fmtDuration(run.durationMs)}
                    </TableCell>
                    <TableCell>
                      {acc !== null ? (
                        <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                          <Badge
                            variant="outline"
                            className={
                              acc >= 80
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }
                          >
                            {acc}%
                          </Badge>
                          {run.goldMatches}/{run.goldTotal}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{run.accounts}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {run.tokens.input.toLocaleString()} / {run.tokens.output.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {fmtUsd(run.costUsd)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Each eval replays the exact production pipeline (same model, same prompts) and is scored
        against data/gold-labels.json — a frozen snapshot of human-verified labels. Review routing and
        confidence are engineering signals here, never a queue for sales.
      </p>
    </div>
  );
}
