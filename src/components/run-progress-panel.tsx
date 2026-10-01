"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlaskConicalIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn, labelBadgeClass } from "@/lib/utils";
import type { RunProgressItem } from "@/lib/schemas";

type RunProgressPanelProps = {
  items: RunProgressItem[];
  batchSize: number;
  running: boolean;
  elapsed: number;
  onClose: () => void;
  cancelled?: boolean;
  onCancel?: () => void;
  /** "eval" retitles the panel and shows the gold score when finished. */
  variant?: "run" | "eval";
  evalScore?: { matches: number; total: number } | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function StatusIcon({ item }: { item: RunProgressItem }) {
  if (item.status === "running") {
    return <Spinner className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (item.status === "done") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
      </span>
    );
  }
  if (item.status === "failed") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/15">
        <XIcon className="size-3 text-destructive" />
      </span>
    );
  }
  return <span className="size-4 shrink-0 rounded-full border border-border" />;
}

/**
 * Bottom-right floating panel showing live per-account status during a
 * pipeline run: queued → spinning → green tick (or red cross on failure),
 * grouped into batches, auto-scrolling as the run moves to the next batch.
 */
export function RunProgressPanel({
  items,
  batchSize,
  running,
  elapsed,
  onClose,
  cancelled = false,
  onCancel,
  variant = "run",
  evalScore = null,
}: RunProgressPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const batchRefs = useRef<Array<HTMLDivElement | null>>([]);

  const batches = useMemo(() => chunk(items, batchSize), [items, batchSize]);
  const doneCount = items.filter(
    (item) => item.status === "done" || item.status === "failed",
  ).length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const labeledCount = items.filter((item) => item.outcome === "labeled").length;
  const skippedCount = items.filter((item) => item.outcome === "skipped").length;
  const percent = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  // First batch that still has work in it. Accounts roll across batch
  // boundaries one at a time, so this flips to the next batch once the
  // previous one has fully settled — that flip is the auto-scroll trigger.
  const activeBatch = useMemo(() => {
    for (let i = 0; i < batches.length; i++) {
      if (batches[i].some((item) => item.status === "running")) return i;
    }
    for (let i = 0; i < batches.length; i++) {
      if (batches[i].some((item) => item.status === "queued")) return i;
    }
    return Math.max(0, batches.length - 1);
  }, [batches]);

  useEffect(() => {
    const container = scrollRef.current;
    const target = batchRefs.current[activeBatch];
    if (collapsed || !container || !target) return;
    container.scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: "smooth" });
  }, [activeBatch, collapsed]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-lg sm:bottom-6 sm:right-6">
      <div className="flex items-center justify-between gap-2 py-2 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {running ? (
            <Spinner className="size-4 shrink-0" />
          ) : failedCount > 0 ? (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/15">
              <XIcon className="size-3 text-destructive" />
            </span>
          ) : (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
            </span>
          )}
          {variant === "eval" && !running && (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
              <FlaskConicalIcon className="size-3 text-violet-600 dark:text-violet-400" />
            </span>
          )}
          <span className="truncate">
            {running
              ? variant === "eval"
                ? "Evaluating accounts"
                : "Assessing accounts"
              : cancelled
                ? "Run cancelled"
                : failedCount > 0
                  ? variant === "eval"
                    ? "Evaluation finished with failures"
                    : "Run finished with failures"
                  : variant === "eval"
                    ? "Evaluation complete"
                    : "Run complete"}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          {running && (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {elapsed}s
            </span>
          )}
          <button
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronUpIcon className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="px-4 pb-3">
            <Progress value={percent} aria-label={`Run progress ${percent}%`} />
          </div>
          <div
            ref={scrollRef}
            className="relative max-h-64 overflow-y-auto px-4 pb-3"
            aria-live="polite"
          >
            {batches.map((batch, batchIndex) => (
              <div
                key={batchIndex}
                ref={(el) => {
                  batchRefs.current[batchIndex] = el;
                }}
                className={cn("py-2", batchIndex > 0 && "border-t")}
              >
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Batch {batchIndex + 1}
                </div>
                <ul className="space-y-1.5">
                  {batch.map((item) => (
                    <li key={item.accountId} className="flex items-center gap-2 text-sm">
                      <StatusIcon item={item} />
                      <span
                        className={cn(
                          "truncate",
                          item.status === "queued" && "text-muted-foreground",
                        )}
                      >
                        {item.name}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center">
                        {item.status === "running" && (
                          <span className="text-xs text-muted-foreground">assessing…</span>
                        )}
                        {item.status === "done" && item.outcome === "labeled" && (
                          <Badge
                            variant="outline"
                            className={cn("text-xs", labelBadgeClass[item.label ?? ""] ?? "")}
                          >
                            {item.label}
                          </Badge>
                        )}
                        {item.status === "done" && item.outcome === "skipped" && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Skipped
                          </Badge>
                        )}
                        {item.status === "failed" && (
                          <Badge variant="destructive" className="text-xs">
                            Failed
                          </Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              {running
                ? "automated messages are rule-filtered before any LLM call"
                : cancelled
                  ? `Cancelled · ${doneCount}/${items.length} accounts assessed · results kept`
                  : variant === "eval" && evalScore
                    ? `Gold matches ${evalScore.matches}/${evalScore.total} · ${items.length} accounts · ${labeledCount} labeled · ${skippedCount} skipped${
                        failedCount > 0 ? ` · ${failedCount} failed` : ""
                      }`
                    : `${items.length} accounts · ${labeledCount} labeled · ${skippedCount} skipped${
                        failedCount > 0 ? ` · ${failedCount} failed` : ""
                      }`}
            </span>
            {running && onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel run
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Small floating chip shown when a server-side run is live but its panel has
 * been dismissed — one click brings the panel back.
 */
export function RunReopenChip({
  elapsed,
  onReopen,
  variant = "run",
}: {
  elapsed: number;
  onReopen: () => void;
  variant?: "run" | "eval";
}) {
  return (
    <button
      type="button"
      onClick={onReopen}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-lg transition-colors hover:bg-muted sm:bottom-6 sm:right-6"
    >
      <Spinner className="size-4 text-muted-foreground" />
      {variant === "eval" && (
        <FlaskConicalIcon className="size-4 text-violet-600 dark:text-violet-400" />
      )}
      <span>{variant === "eval" ? "Evaluation in progress" : "Run in progress"}</span>
      <span className="tabular-nums text-muted-foreground">{elapsed}s</span>
    </button>
  );
}
