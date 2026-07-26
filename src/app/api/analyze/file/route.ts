import { NextResponse } from "next/server";
import { ExtractError, analyzeUpload } from "@/lib/document";
import { MAX_UPLOAD_BYTES } from "@/lib/intake";
import { DISCIPLINE_ORDER } from "@/lib/discipline/profiles";
import { getTrend, saveAnalysis, trendKeyFor } from "@/lib/history";
import type { DisciplineKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload analysis.
 *
 * The uploaded bytes are never written to disk. They are extracted in memory, the
 * findings are stored, and the file itself is dropped — a resume is the most personal
 * document most people own, and holding onto one would be a liability with no
 * corresponding benefit. The visible consequence is that an upload cannot be re-analyzed
 * from history the way a URL can; the user has to upload it again, which is the right
 * trade.
 */

/** Extraction failure modes, mapped so the UI can tell "your file" from "our fault". */
const STATUS_BY_CODE: Record<string, number> = {
  empty: 400,
  "too-large": 413,
  unsupported: 415,
  "legacy-office": 415,
  rtf: 415,
  pages: 415,
  "plain-text": 415,
  corrupt: 422,
  encrypted: 422,
  "no-text-layer": 422,
  "no-text": 422,
  "ocr-failed": 500,
};

function asDiscipline(value: unknown): DisciplineKey | null {
  return typeof value === "string" && (DISCIPLINE_ORDER as string[]).includes(value)
    ? (value as DisciplineKey)
    : null;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was included in the upload." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`,
        code: "too-large",
      },
      { status: 413 },
    );
  }

  const rawKind = form.get("documentKind");
  const documentKind =
    rawKind === "resume" || rawKind === "document" ? (rawKind as "resume" | "document") : null;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const analysis = await analyzeUpload(
      // Strip any directory component a browser might include.
      { fileName: file.name.split(/[\\/]/).pop() || "upload", bytes },
      {
        documentKind,
        discipline: asDiscipline(form.get("discipline")),
        aiReview: form.get("ai") !== "false",
        checkLinks: form.get("checkLinks") === "true",
      },
    );

    if (form.get("save") !== "false") {
      // A failed history write must not fail the analysis the user waited for.
      await saveAnalysis(analysis.result).catch(() => undefined);
    }

    const trend = await getTrend(trendKeyFor(analysis.result), analysis.result.kind).catch(
      () => [],
    );

    return NextResponse.json({
      result: analysis.result,
      trend,
      detectedKind: analysis.detectedKind,
      classificationConfidence: analysis.classificationConfidence,
      classificationReasons: analysis.classificationReasons,
    });
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json(
        { error: error.message, code: error.code, suggestion: error.suggestion },
        { status: STATUS_BY_CODE[error.code] ?? 422 },
      );
    }
    console.error("upload analysis failed", error);
    return NextResponse.json(
      { error: "Something went wrong while reading that file." },
      { status: 500 },
    );
  }
}
