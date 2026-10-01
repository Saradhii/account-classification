import type { ReactNode } from "react";
import { Progress } from "@/components/ui/progress";

export function StatCard({
  label,
  value,
  hint,
  children,
  size = "lg",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  size?: "lg" | "sm";
}) {
  const valueClass =
    size === "sm"
      ? "mt-1 font-medium tabular-nums"
      : "mt-1 text-2xl font-semibold tabular-nums";
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={valueClass}>{value}</dd>
      {hint !== undefined && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export function ConfidenceCell({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-sm tabular-nums">{confidence.toFixed(2)}</span>
      <Progress value={confidence * 100} className="h-1.5 w-16" />
    </div>
  );
}
