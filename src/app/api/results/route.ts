import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadExport, loadGold } from "@/lib/data";
import { PipelineRunSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const demoRunRaw = JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "demo-run.json"), "utf8"),
    );
    const run = PipelineRunSchema.parse(demoRunRaw);
    return NextResponse.json({
      export: loadExport(),
      run,
      gold: loadGold(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
}
