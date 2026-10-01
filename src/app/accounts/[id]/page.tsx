"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppData } from "@/lib/use-live-run";
import { StatCard } from "@/components/stat-card";
import {
  labelBadgeClass,
  sentimentBadgeClass,
  weightBadgeClass,
} from "@/lib/utils";
import { formatTimestamp } from "@/lib/format";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const { state, error } = useAppData();
  const [openBodies, setOpenBodies] = useState<Record<string, boolean>>({});

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!state) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const accountId = Array.isArray(params.id) ? params.id[0] : params.id;
  const account = state.export.accounts.find((a) => a.id === accountId);
  const result = state.run.results.find((r) => r.accountId === accountId);

  if (!account || !result) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Dashboard
          </Link>
          <ChevronRightIcon className="size-4" />
          <span className="text-foreground">Not found</span>
        </nav>
        <Alert>
          <AlertTitle>Account not found</AlertTitle>
          <AlertDescription>No account with id {accountId} in the current data.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const accountTasks = state.export.tasks
    .filter((task) => task.accountId === accountId)
    .sort((a, b) => b.daysAgo - a.daysAgo || a.timeOfDay.localeCompare(b.timeOfDay));
  const accountEvents = state.export.events.filter((event) => event.accountId === accountId);
  const evidenceTasks = result.evidence
    .map((item) => ({ item, task: accountTasks.find((task) => task.id === item.taskId) }))
    .filter((entry): entry is { item: typeof entry.item; task: NonNullable<typeof entry.task> } => Boolean(entry.task));
  const citedTaskIds = new Set(result.evidence.map((item) => item.taskId));
  const uncitedTasks = accountTasks.filter((task) => !task.isAutomated && !citedTaskIds.has(task.id));
  const automatedTasks = accountTasks.filter((task) => task.isAutomated);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRightIcon className="size-4" />
        <span className="truncate text-foreground">{account.name}</span>
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{account.name}</h1>
          {result.outcome === "labeled" && result.label ? (
            <Badge variant="outline" className={labelBadgeClass[result.label] ?? ""}>
              {result.label}
            </Badge>
          ) : result.outcome === "skipped" ? (
            <Badge variant="outline">Skipped</Badge>
          ) : (
            <Badge variant="destructive">Failed</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.type} · {account.region} · {account.tier} · renewal in {account.renewalInDays ?? "—"} days (context only, not a sentiment input)
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Confidence"
          size="sm"
          value={result.confidence !== null ? result.confidence.toFixed(2) : "—"}
        >
          {result.confidence !== null && (
            <Progress value={result.confidence * 100} className="mt-2 h-1.5" />
          )}
        </StatCard>
        <StatCard label="Salesforce write" size="sm" value={result.salesforceWrite} />
        <StatCard label="Prior label" size="sm" value={result.priorLabel ?? "none"} />
        <StatCard
          label="Review"
          size="sm"
          value={result.routedToReview ? "needs review" : "automatic"}
        />
      </dl>

      {result.routedToReview && (
        <Alert variant="warning">
          <AlertTitle>Routed to human review</AlertTitle>
          <AlertDescription>
            {result.error
              ? "Assessment failed and the account needs a human look before the label is trusted."
              : "Confidence below the 0.75 threshold or an aggregation rule flagged inconsistent evidence. A CSM confirms before the field is trusted."}
          </AlertDescription>
        </Alert>
      )}

      {result.error && (
        <Alert variant="destructive">
          <AlertTitle>Assessment error</AlertTitle>
          <AlertDescription className="font-mono text-xs">{result.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Why this label</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{result.reasoning}</p>
          {result.priorLabel && result.outcome === "labeled" && (
            <p className="text-xs text-muted-foreground">
              Trend this cycle: {result.priorLabel} → {result.label}
              {result.salesforceWrite === "unchanged" ? " (no write, label unchanged)" : " (field written to Salesforce)"}
            </p>
          )}
          {result.ruleAdjustments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Deterministic rule adjustments</p>
                {result.ruleAdjustments.map((adjustment) => (
                  <p key={adjustment} className="text-xs text-muted-foreground">· {adjustment}</p>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {evidenceTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Message evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {evidenceTasks.map(({ item, task }) => (
              <div key={item.taskId} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={sentimentBadgeClass[item.sentiment] ?? ""}>{item.sentiment}</Badge>
                  <Badge variant="outline" className={weightBadgeClass[item.weight] ?? ""}>{item.weight} weight</Badge>
                  <span className="text-sm font-medium">{item.citedPersona}</span>
                  <span className="text-xs text-muted-foreground">{task.subject}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{item.note}</p>
                <Collapsible open={openBodies[item.taskId] ?? false} onOpenChange={(open) => setOpenBodies((prev) => ({ ...prev, [item.taskId]: open }))}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs text-muted-foreground">
                      {openBodies[item.taskId] ? "Hide original" : "Show original"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md bg-muted/60 p-3">
                      <p className="text-xs text-muted-foreground">
                        {task.direction} · from {task.from.name} ({task.from.role}) · to {task.to.map((p) => p.name).join(", ")}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{task.body}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.eventEvidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meeting evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.eventEvidence.map((item) => {
              const event = accountEvents.find((e) => e.id === item.eventId);
              return (
                <div key={item.eventId} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={weightBadgeClass[item.weight] ?? ""}>{item.weight} weight</Badge>
                    <span className="text-sm font-medium">{event?.subject ?? item.eventId}</span>
                    {event && (
                      <span className="text-xs text-muted-foreground">
                        {event.status} · requested by {event.requestedBy === "account" ? "the bank" : "Backbase"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{item.note}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pipeline detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{result.consideredMessages} messages considered · {result.filteredAsAutomated} automated messages filtered by rules before any LLM call</p>
          {automatedTasks.length > 0 && (
            <p>
              Filtered: {automatedTasks.map((task) => `${task.id} (${task.autoType})`).join(", ")}
            </p>
          )}
          {uncitedTasks.length > 0 && (
            <p>Not cited as evidence: {uncitedTasks.map((task) => task.id).join(", ")}</p>
          )}
          <p>
            {result.llmMode ? `LLM path: ${result.llmMode} · ` : "No LLM call · "}
            {result.modelUsed} · {formatTimestamp(result.generatedAt)} · tokens {result.tokens.input} in / {result.tokens.output} out
          </p>
          <p className="text-xs">
            Evidence notes are the model&apos;s paraphrase. Original bodies above are joined from the source export at view time and are never stored in results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
