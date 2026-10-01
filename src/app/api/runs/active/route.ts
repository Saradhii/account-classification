import { NextResponse } from "next/server";
import { activeRunView } from "@/lib/run-manager";

/** Current server-side run (live or recently finished), or null. */
export async function GET() {
  return NextResponse.json({ run: activeRunView() });
}
