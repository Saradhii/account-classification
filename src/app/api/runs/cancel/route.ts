import { NextResponse } from "next/server";
import { requestCancel } from "@/lib/run-manager";

/**
 * Requests cooperative cancellation: no new accounts are started; accounts
 * already in flight finish and are persisted; the run row is then marked
 * 'cancelled' with whatever partial results exist.
 */
export async function POST() {
  const ok = requestCancel();
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}
