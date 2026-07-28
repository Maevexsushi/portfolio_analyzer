import { NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, getOwnerToken, getTrend, trendKeyFor } from "@/lib/history";
import { ownerTokenForRead } from "@/lib/ownerToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAnalysis(id);
  if (!result) {
    return NextResponse.json({ error: "That analysis is no longer stored." }, { status: 404 });
  }
  // Scoped to whoever this report actually belongs to, not whoever is asking —
  // the report itself stays sharable by id, but its trend line is still that
  // owner's own history, not the requester's.
  const owner = await getOwnerToken(id);
  const trend = await getTrend(trendKeyFor(result), result.kind, owner).catch(() => []);
  return NextResponse.json({ result, trend });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerToken = await ownerTokenForRead();
  // No cookie means this visitor owns nothing, so nothing they ask for can be theirs.
  const deleted = ownerToken ? await deleteAnalysis(id, ownerToken) : false;
  if (!deleted) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
