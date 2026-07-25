import { NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, getTrend } from "@/lib/history";

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
  const trend = await getTrend(result.finalUrl).catch(() => []);
  return NextResponse.json({ result, trend });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteAnalysis(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
