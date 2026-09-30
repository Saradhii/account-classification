export const labelBadgeClass: Record<string, string> = {
  Positive: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Negative: "bg-red-100 text-red-800 border-red-300",
  Mixed: "bg-amber-100 text-amber-900 border-amber-300",
  Neutral: "bg-slate-100 text-slate-700 border-slate-300",
};

export const sentimentBadgeClass: Record<string, string> = {
  Positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Negative: "bg-red-50 text-red-700 border-red-200",
  Neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

export const weightBadgeClass: Record<string, string> = {
  High: "border-purple-300 bg-purple-50 text-purple-800",
  Medium: "border-sky-300 bg-sky-50 text-sky-800",
  Low: "border-slate-200 bg-slate-50 text-slate-600",
};

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
