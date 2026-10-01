import { format } from "date-fns";

/** Human-readable timestamp, e.g. "Oct 1, 2026 · 4:49 PM". */
export function formatTimestamp(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy · h:mm a");
}

/** USD with adaptive precision: sub-dollar LLM costs need more decimals. */
export function fmtUsd(value: number): string {
  const decimals = value < 1 ? 4 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}
