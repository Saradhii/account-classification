import { NextRequest, NextResponse } from "next/server";
import { getRunDetail, hasDatabase } from "@/lib/db";
import { costOf } from "@/lib/cost";
import { loadExport } from "@/lib/data";
import { toMessage } from "@/lib/utils";

/**
 * Full detail for one historical run: metadata + every per-account result,
 * plus the account directory (names/regions) for display joins.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "no database configured" }, { status: 503 });
  }
  try {
    const { id } = await params;
    const detail = await getRunDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    }
    return NextResponse.json({
      run: {
        ...detail,
        costUsd: costOf(detail.tokens),
      },
      accounts: loadExport().accounts.map(({ id: accountId, name, type, region, tier }) => ({
        id: accountId,
        name,
        type,
        region,
        tier,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}
