"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toMessage } from "./utils";
import type {
  RunProgressItem,
  SalesforceExport,
  PipelineRun,
  GoldFile,
} from "./schemas";

// Batch size used purely for display grouping in the progress panel.
export const RUN_BATCH_SIZE = 3;

const POLL_INTERVAL_MS = 1500;

type ActiveRunView = {
  runId: string;
  startedAtMs: number;
  cancelRequested: boolean;
  cancelled: boolean;
  finished: boolean;
  items: RunProgressItem[];
};

export type AppState = {
  export: SalesforceExport;
  run: PipelineRun;
  gold: GoldFile;
  source: "cached" | "live";
  /** "file" means no usable database: serving the prerecorded demo run. */
  runOrigin: "db" | "file";
  /** Run row status: running | complete | cancelled | failed. */
  runStatus: string;
};

export function useAppData(kind: "production" | "eval" = "production") {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/results?kind=${kind}`);
      if (!response.ok) throw new Error(`results endpoint returned ${response.status}`);
      const data = await response.json();
      setState({
        export: data.export,
        run: data.run,
        gold: data.gold,
        source: data.source ?? "cached",
        runOrigin: data.runOrigin ?? "file",
        runStatus: data.runStatus ?? "complete",
      });
      setError(null);
    } catch (err) {
      setError(toMessage(err));
    }
  }, [kind]);

  useEffect(() => {
    // setState runs only after the awaited fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { state, error, refresh };
}

/**
 * Client window onto the server-side run manager: the run loop lives in the
 * Node process, so progress survives page refreshes and is shareable across
 * browsers. This hook polls /api/runs/active, exposes progress items for
 * the panel, and starts/cancels runs. kind="eval" starts engineering-test
 * runs scored against the gold snapshot.
 */
export function useLiveRun(kind: "production" | "eval" = "production") {
  const app = useAppData(kind);
  const [active, setActive] = useState<ActiveRunView | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastDoneRef = useRef(-1);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/runs/active", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      const run: ActiveRunView | null = body.run;
      setActive(run);
      if (run) {
        // Stream partial results into the page as accounts land server-side.
        const done = run.items.filter(
          (item) => item.status === "done" || item.status === "failed",
        ).length;
        if (done !== lastDoneRef.current) {
          lastDoneRef.current = done;
          if (done > 0) await app.refresh();
        }
      }
    } catch {
      // transient poll failure — the next tick retries
    }
  }, [app]);

  useEffect(() => {
    // setState runs only after the awaited fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  // Elapsed comes from the server's start time, so it stays correct across
  // page refreshes.
  const activeRunId = active?.runId;
  const activeFinished = active?.finished ?? true;
  useEffect(() => {
    if (!activeRunId || activeFinished) return;
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [activeRunId, activeFinished]);

  const running = active !== null && !active.finished;
  const elapsed = active
    ? Math.max(0, Math.round((now - active.startedAtMs) / 1000))
    : 0;

  const runPipelineNow = useCallback(async () => {
    setDismissed(false);
    try {
      const response = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && body.active) {
        // A run is already live server-side — converge on it instead of erroring.
        setActive(body.active);
        setNow(Date.now());
        return;
      }
      if (!response.ok) {
        // One clear toast instead of a run where every account fails.
        toast.error(body.error ?? `start endpoint returned ${response.status}`);
        return;
      }
      setNow(Date.now());
      await poll();
    } catch (err) {
      toast.error(toMessage(err));
    }
  }, [poll, kind]);

  const cancelRun = useCallback(async () => {
    try {
      await fetch("/api/runs/cancel", { method: "POST" });
      await poll();
    } catch {
      // next poll picks up the state anyway
    }
  }, [poll]);

  return {
    ...app,
    running,
    runItems: active?.items ?? null,
    runCancelled: active?.cancelled ?? false,
    elapsed,
    runPipelineNow,
    cancelRun,
    dismissed,
    dismissRunItems: () => setDismissed(true),
    reopenRunPanel: () => setDismissed(false),
  };
}
