import { NextResponse } from "next/server";
import { clearHistory, listHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await listHistory();
  return NextResponse.json({ entries });
}

export async function DELETE() {
  await clearHistory();
  return NextResponse.json({ ok: true });
}
