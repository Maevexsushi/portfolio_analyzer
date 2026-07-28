import { NextResponse } from "next/server";
import { clearHistory, listHistory } from "@/lib/history";
import { ownerTokenForRead } from "@/lib/ownerToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await listHistory(await ownerTokenForRead());
  return NextResponse.json({ entries });
}

export async function DELETE() {
  const ownerToken = await ownerTokenForRead();
  // No cookie means nothing was ever saved under it; nothing to clear.
  if (ownerToken) await clearHistory(ownerToken);
  return NextResponse.json({ ok: true });
}
