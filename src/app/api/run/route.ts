import { NextRequest, NextResponse } from "next/server";
import { startRun, RunAlreadyActiveError } from "@/lib/run-manager";
import { toMessage } from "@/lib/utils";

/**
 * Scheduled trigger: a cron job (every 2 weeks in production) calls this GET
 * with the x-cron-secret header. Starts the same server-side run loop the
 * dashboard button uses and returns immediately.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const runId = await startRun("cron");
    return NextResponse.json({ runId, started: true });
  } catch (error) {
    if (error instanceof RunAlreadyActiveError) {
      return NextResponse.json(
        { error: error.message, runId: error.existingRunId },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}
