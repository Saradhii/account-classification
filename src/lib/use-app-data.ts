"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalesforceExport, PipelineRun, GoldFile } from "./schemas";

export type AppState = {
  export: SalesforceExport;
  run: PipelineRun;
  gold: GoldFile;
  source: "cached" | "live";
};

const STORAGE_KEY = "ahs-live-run";

export function useAppData() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/results");
      if (!response.ok) throw new Error(`results endpoint returned ${response.status}`);
      const base = await response.json();
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (stored) {
        setState({ ...base, run: JSON.parse(stored), source: "live" });
      } else {
        setState({ ...base, source: "cached" });
      }
      setError(null);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setLiveRun = useCallback((run: PipelineRun) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    load();
  }, [load]);

  const clearLiveRun = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    load();
  }, [load]);

  return { state, error, setLiveRun, clearLiveRun };
}
