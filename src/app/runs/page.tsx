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

type RunsResponse = {
  runs: HistoryRow[];
  pricing: { inputPerMTok: number; outputPerMTok: number };
};

// Full production shape from the case brief: 5000 accounts, refreshed every
// 2 weeks ≈ 26 cycles per year. Extrapolated linearly from observed spend.
const PRODUCTION_ACCOUNTS = 5000;
const CYCLES_PER_YEAR = 26;

const triggerBadgeClass: Record<string, string> = {
  manual: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  cron: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export default function RunsPage() {
  const [data, setData] = useState<RunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs?kind=production")
      .then(async (response) => {
        if (!response.ok) throw new Error(`runs endpoint returned ${response.status}`);
        return response.json();
      })
      .then((body: RunsResponse) => setData(body))
      .catch((err) => setError(String(err?.message ?? err)));
  }, []);

  const totals = useMemo(() => {
    if (!data || data.runs.length === 0) return null;
    const totalSpend = data.runs.reduce((sum, run) => sum + run.costUsd, 0);
    const accountsAssessed = data.runs.reduce((sum, run) => sum + run.accounts, 0);
    const perAccount = accountsAssessed > 0 ? totalSpend / accountsAssessed : 0;
    const perCycle = perAccount * PRODUCTION_ACCOUNTS;
    return {
      runs: data.runs.length,
      totalSpend,
      avgPerRun: totalSpend / data.runs.length,
      perCycle,
      perYear: perCycle * CYCLES_PER_YEAR,
    };
  }, [data]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load run history</AlertTitle>
        <AlertDescription>
          {error}. Run history needs a database connection.
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || !totals) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
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
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Production runs with duration and LLM cost. These are the labels sales sees. Engineering
          replays live on the{" "}
          <a href="/evals" className="underline underline-offset-4 hover:text-foreground">Evals</a> page.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Runs recorded" value={totals.runs} hint="every one a real, billable run" />
        <StatCard label="Total spend" value={fmtUsd(totals.totalSpend)} hint="across all production runs" />
        <StatCard label="Avg per run" value={fmtUsd(totals.avgPerRun)} hint="10 accounts per run" />
        <StatCard
          label="Per cycle at scale"
          value={fmtUsd(totals.perCycle)}
          hint="5,000 accounts · one 2-week refresh"
        />
        <StatCard
          label="Projected annual"
          value={fmtUsd(totals.perYear)}
          hint="26 cycles per year at 5,000 accounts"
        />
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Accounts</TableHead>
              <TableHead>Review queue</TableHead>
              <TableHead className="text-right">Tokens (in / out)</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.runs.map((run) => (
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
                  <Badge variant="outline" className={triggerBadgeClass[run.triggeredBy] ?? ""}>
                    {run.triggeredBy}
                  </Badge>
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
                <TableCell className="text-sm tabular-nums">{fmtDuration(run.durationMs)}</TableCell>
                <TableCell className="text-sm tabular-nums">{run.accounts}</TableCell>
                <TableCell className="text-sm tabular-nums">{run.routedToReview}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {run.tokens.input.toLocaleString()} / {run.tokens.output.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {fmtUsd(run.costUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Costs assume ${data.pricing.inputPerMTok.toFixed(2)} per 1M input and $
        {data.pricing.outputPerMTok.toFixed(2)} per 1M output tokens (glm-5.3 list prices). Override
        with ZAI_INPUT_PRICE / ZAI_OUTPUT_PRICE. Scale projections are linear extrapolations from
        live runs on this dataset. That is an assumption to state, not a quote.
      </p>
    </div>
  );
}
