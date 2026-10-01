import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadExport, loadGold } from "@/lib/data";
import { PipelineRunSchema } from "@/lib/schemas";
import { getLatestRun, hasDatabase } from "@/lib/db";
import { toMessage } from "@/lib/utils";

/**
 * Latest run + source data for the pages. ?kind=production (dashboard,
 * account detail) never serves eval runs; ?kind=eval (Evaluation page)
 * prefers eval runs but falls back to any run so it can score something
 * before the first explicit eval run exists.
 *
 * Precedence: Postgres when configured and non-empty, otherwise the run
 * shipped in data/demo-run.json. runOrigin says which happened.
 */
export async function GET(request: NextRequest) {
  try {
    const kindParam = request.nextUrl.searchParams.get("kind");
    const kind = kindParam === "eval" ? "eval" : "production";
    const exportData = loadExport();
    const gold = loadGold();

    if (hasDatabase()) {
      try {
        const latest = await getLatestRun(kind);
        if (latest) {
          return NextResponse.json({
            export: exportData,
            run: latest.run,
            gold,
            source: latest.triggeredBy === "demo-seed" ? "cached" : "live",
            runOrigin: "db",
            runStatus: latest.status,
          });
        }
      } catch (error) {
        console.warn("database unavailable, serving the shipped demo run:", error);
      }
    }

    // Zero-config floor: the prerecorded run shipped with the repo.
    const run = PipelineRunSchema.parse(
      JSON.parse(readFileSync(path.join(process.cwd(), "data", "demo-run.json"), "utf8")),
    );
    return NextResponse.json({
      export: exportData,
      run,
      gold,
      source: "cached",
      runOrigin: "file",
      runStatus: "complete",
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}
