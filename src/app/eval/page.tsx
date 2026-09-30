"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const AXIS = ["Positive", "Neutral", "Negative", "Mixed", "Skipped"];

export default function EvalPage() {
  const { state, error } = useAppData();

  const comparison = useMemo(() => {
    if (!state) return null;
    const rows = state.gold.gold.map((entry) => {
      const result = state.run.results.find((r) => r.accountId === entry.accountId);
      const got =
        !result ? "Missing" :
        result.outcome === "skipped" ? "Skipped" :
        result.outcome === "failed" ? "Failed" :
        result.label ?? "Unknown";
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
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.source === "live" ? "live run (this browser)" : "cached demo run"} ·{" "}
            {formatTimestamp(state.run.finishedAt)} · {state.run.modelUsed}
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums">
            {comparison.matches}/{comparison.total}
          </span>
          <span className="text-sm text-muted-foreground">gold matches</span>
        </div>
      </div>

      <Alert>
        <AlertTitle>What this proves, and what it does not</AlertTitle>
        <AlertDescription>
          The synthetic set is a smoke and regression test over known scenarios, not evidence of accuracy on real
          customer emails. The production answer is a stratified sample of real accounts hand-labeled by CSMs, scored
          with a confusion matrix and weighted error costs (a happy customer marked Negative is the most expensive
          mistake). That sample then becomes the ongoing regression set this page runs against.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confusion matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ${
                              isDiagonal ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-account comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                    <div className="font-medium">{row.name}</div>
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
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">routed as designed</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">not routed</Badge>
                      )
                    ) : row.reviewRouting ? (
                      <Badge variant="outline">routed</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.match ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">match</Badge>
                    ) : (
                      <Badge variant="destructive">mismatch</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
