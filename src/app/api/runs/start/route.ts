import { NextRequest, NextResponse } from "next/server";
import { startRun, activeRunView, RunAlreadyActiveError } from "@/lib/run-manager";
import { hasDatabase } from "@/lib/db";
import { hasLlmKey } from "@/lib/llm";
import { toMessage } from "@/lib/utils";

/**
 * Starts a server-side pipeline run and returns immediately. Progress is
 * polled via /api/runs/active; only one run may be live at a time (a second
 * start returns 409 with the active run id so callers converge on it).
 * Body: { kind?: "production" | "eval" } — eval runs are engineering tests
 * scored against the gold snapshot; production runs feed the review queue.
 */
export async function POST(request: NextRequest) {
  let kind: "production" | "eval" = "production";
  try {
    const body = await request.json();
    if (body?.kind === "eval") kind = "eval";
  } catch {
    // no body — default production
  }

  const missing = [
    !hasLlmKey() ? "an LLM key" : null,
    !hasDatabase() ? "a database connection" : null,
  ].filter((item): item is string => item !== null);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot start a run yet. Configure ${missing.join(" and ")}. ` +
          "You are viewing demo data until then.",
        reason: "missing-config",
      },
      { status: 400 },
    );
  }

  try {
    const runId = await startRun("manual", kind);
    return NextResponse.json({ runId, kind });
  } catch (error) {
    if (error instanceof RunAlreadyActiveError) {
      return NextResponse.json(
        { error: error.message, runId: error.existingRunId, active: activeRunView() },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}
