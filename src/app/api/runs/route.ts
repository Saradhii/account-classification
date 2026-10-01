import { NextRequest, NextResponse } from "next/server";
import { listRuns, hasDatabase } from "@/lib/db";
import { costOf, pricing } from "@/lib/cost";
import { toMessage } from "@/lib/utils";

/**
 * Run history with durations and LLM cost, filterable by kind:
 * /api/runs?kind=production | eval (no param returns everything).
 * Costs are computed server-side so pricing stays a single server-owned
 * assumption (returned alongside the rows so the UI can state it).
 */
export async function GET(request: NextRequest) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "no database configured" }, { status: 503 });
  }
  try {
    const kindParam = request.nextUrl.searchParams.get("kind");
    const kind = kindParam === "production" || kindParam === "eval" ? kindParam : null;
    const all = await listRuns();
    const runs = kind ? all.filter((run) => run.kind === kind) : all;
    return NextResponse.json({
      runs: runs.map((run) => ({ ...run, costUsd: costOf(run.tokens) })),
      pricing: pricing(),
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}
