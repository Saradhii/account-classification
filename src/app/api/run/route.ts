import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST() {
  try {
    const run = await runPipeline({ concurrency: 3 });
    return NextResponse.json(run);
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const run = await runPipeline({ concurrency: 3 });
    return NextResponse.json(run);
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}
