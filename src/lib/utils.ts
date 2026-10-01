export { cn } from "cn";

export function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Soft-tinted status colors (translucent fills, dark-mode variants) applied
// on top of the outline Badge variant.
export const labelBadgeClass: Record<string, string> = {
  Positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Negative: "bg-destructive/10 text-destructive",
  Mixed: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Neutral: "bg-muted text-muted-foreground",
};

export const sentimentBadgeClass: Record<string, string> = {
  Positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Negative: "bg-destructive/10 text-destructive",
  Neutral: "bg-muted text-muted-foreground",
};

export const weightBadgeClass: Record<string, string> = {
  High: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Medium: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Low: "bg-muted text-muted-foreground",
};

export const reviewBadgeClass =
  "bg-amber-500/10 text-amber-600 dark:text-amber-400";
