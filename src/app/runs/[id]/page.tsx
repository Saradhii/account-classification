"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ConfidenceCell, StatCard } from "@/components/stat-card";
import { fmtUsd, fmtDuration, formatTimestamp } from "@/lib/format";
import { labelBadgeClass, reviewBadgeClass } from "@/lib/utils";
import type { AccountResult } from "@/lib/schemas";

type AccountDir = {
  id: string;
  name: string;
  type: string;
  region: string;
  tier: string;
};

type RunDetail = {
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
  costUsd: number;
  results: AccountResult[];
};

const statusBadge = (status: string) => {
  if (status === "complete") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        complete
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
        running
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        cancelled
      </Badge>
    );
  }
  return <Badge variant="destructive">{status}</Badge>;
};

/**
 * Drill-down for one historical run (production or eval): the full
 * per-account result table with expandable "why this label" reasoning,
 * exactly as assessed at run time — read from Postgres, never recomputed.
 */
export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [accounts, setAccounts] = useState<AccountDir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openWhy, setOpenWhy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    fetch(`/api/runs/${id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`run endpoint returned ${response.status}`);
        return response.json();
      })
      .then((body) => {
        setRun(body.run);
        setAccounts(body.accounts);
      })
      .catch((err) => setError(String(err?.message ?? err)));
  }, [params.id]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load run</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const isEval = run.kind === "eval";
  const accountOf = (accountId: string) => accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href={isEval ? "/evals" : "/runs"} className="hover:text-foreground">
          {isEval ? "Evals" : "Runs"}
        </Link>
        <ChevronRightIcon className="size-4" />
        <span className="truncate text-foreground">{run.runId}</span>
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{isEval ? "Eval run" : "Run"}</h1>
          {isEval && (
            <Badge
              variant="outline"
              className="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            >
              eval
            </Badge>
          )}
          {statusBadge(run.status)}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {run.modelUsed} · {formatTimestamp(run.startedAt)} · {fmtDuration(run.durationMs)} ·{" "}
          {fmtUsd(run.costUsd)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Accounts" value={run.accounts} />
        <StatCard
          label="Labeled"
          value={run.labeled}
          hint={`${run.skipped} skipped${run.failed > 0 ? ` · ${run.failed} failed` : ""}`}
        />
        {isEval ? (
          <StatCard
            label="Gold matches"
            value={
              run.goldMatches !== null && run.goldTotal !== null
                ? `${run.goldMatches}/${run.goldTotal}`
                : "—"
            }
            hint="against the frozen human-verified snapshot"
          />
        ) : (
          <StatCard label="Review queue" value={run.routedToReview} hint="routed for human confirmation" />
        )}
        <StatCard
          label="LLM tokens"
          value={(run.tokens.input + run.tokens.output).toLocaleString()}
          hint={`${run.tokens.input.toLocaleString()} in · ${run.tokens.output.toLocaleString()} out`}
        />
        <StatCard label="LLM calls" value={run.llmCalls} hint="4 automated messages filtered by rules" />
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-36">Confidence</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead>Write</TableHead>
              {!isEval && <TableHead>Review</TableHead>}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.results.map((result) => {
              const account = accountOf(result.accountId);
              const open = openWhy[result.accountId] ?? false;
              return (
                <>
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
                      <span className="text-sm text-muted-foreground">{result.salesforceWrite}</span>
                    </TableCell>
                    {!isEval && (
                      <TableCell>
                        {result.routedToReview ? (
                          <Badge variant="outline" className={reviewBadgeClass}>
                            needs review
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setOpenWhy((prev) => ({ ...prev, [result.accountId]: !open }))
                        }
                      >
                        {open ? "Hide" : "Why"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={`${result.accountId}-why`} className="hover:bg-transparent">
                      <TableCell colSpan={isEval ? 6 : 7} className="bg-muted/30 p-4">
                        <div className="space-y-2">
                          <p className="text-sm leading-relaxed">{result.reasoning}</p>
                          {result.evidence.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Message evidence (paraphrased)
                              </p>
                              {result.evidence.map((item) => (
                                <p key={item.taskId} className="text-xs text-muted-foreground">
                                  · {item.sentiment} · {item.weight} weight · {item.citedPersona}:{" "}
                                  {item.note}
                                </p>
                              ))}
                            </div>
                          )}
                          {result.eventEvidence.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Meeting evidence (paraphrased)
                              </p>
                              {result.eventEvidence.map((item) => (
                                <p key={item.eventId} className="text-xs text-muted-foreground">
                                  · {item.weight} weight: {item.note}
                                </p>
                              ))}
                            </div>
                          )}
                          {result.ruleAdjustments.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Deterministic rule adjustments
                              </p>
                              {result.ruleAdjustments.map((adjustment) => (
                                <p key={adjustment} className="text-xs text-muted-foreground">
                                  · {adjustment}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Every row is the result as assessed at run time, read back from Postgres — nothing here is
        recomputed. Original email bodies are never stored; evidence notes are the model&apos;s
        paraphrase.
      </p>
    </div>
  );
}
