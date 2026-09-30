"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppData } from "@/lib/use-app-data";
import { labelBadgeClass, sentimentBadgeClass, weightBadgeClass, formatTimestamp } from "@/lib/ui-labels";

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const accountId = Array.isArray(params.id) ? params.id[0] : params.id;
  const account = state.export.accounts.find((a) => a.id === accountId);
  const result = state.run.results.find((r) => r.accountId === accountId);

  if (!account || !result) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← All accounts</Link>
        </Button>
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
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">← All accounts</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            {result.outcome === "labeled" && result.label ? (
              <Badge variant="outline" className={`text-sm ${labelBadgeClass[result.label] ?? ""}`}>
                {result.label}
              </Badge>
            ) : result.outcome === "skipped" ? (
              <Badge variant="outline" className="text-sm">Skipped</Badge>
            ) : (
              <Badge variant="destructive" className="text-sm">Failed</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {account.type} · {account.region} · {account.tier} · renewal in {account.renewalInDays ?? "—"} days (context only, not a sentiment input)
          </p>
        </div>
        <Card className="w-full max-w-xs">
          <CardContent className="space-y-2 py-4">
            {result.confidence !== null ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-medium tabular-nums">{result.confidence.toFixed(2)}</span>
                </div>
                <Progress value={result.confidence * 100} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No confidence — not assessed</p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Salesforce write</span>
              <span className="font-medium">{result.salesforceWrite}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Prior label</span>
              <span className="font-medium">{result.priorLabel ?? "none"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {result.routedToReview && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTitle className="text-amber-900">Routed to human review</AlertTitle>
          <AlertDescription className="text-amber-900">
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
          <CardTitle className="text-base">Why this label</CardTitle>
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
            <CardTitle className="text-base">Message evidence</CardTitle>
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
            <CardTitle className="text-base">Meeting evidence</CardTitle>
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
          <CardTitle className="text-base">Pipeline detail</CardTitle>
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
