import { NextResponse } from "next/server";
import { ExtractError, analyzeUpload } from "@/lib/document";
import { MAX_UPLOAD_BYTES } from "@/lib/intake";
import { DISCIPLINE_ORDER } from "@/lib/discipline/profiles";
import { getTrend, saveAnalysis, trendKeyFor } from "@/lib/history";
import { FetchError, fetchPage } from "@/lib/fetcher";
import { buildContext } from "@/lib/analyzer/context";
import { isPostingUrl } from "@/lib/jobmatch/rank";
import { ownerTokenForRead, ownerTokenForWrite } from "@/lib/ownerToken";
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

/** A job posting or cover letter pasted in as text, capped well above what a real one needs. */
const MAX_PASTED_TEXT = 20_000;

function asPastedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_PASTED_TEXT) : null;
}

/**
 * A job posting is usually pasted as text, but a reader with the posting open in
 * another tab shouldn't have to copy the whole thing out first. When the field is
 * nothing but a link — the same strict, whole-string check Rank Postings uses — it is
 * fetched fresh through the SSRF-guarded fetcher rather than matched against the raw
 * URL text. A link that fails to fetch is reported as an error rather than silently
 * matched against nothing, since unlike Rank Postings this is the only posting given.
 */
async function resolveJobDescription(
  raw: string | null,
): Promise<{ text: string | null } | { error: string }> {
  if (!raw || !isPostingUrl(raw)) return { text: raw };
  try {
    const fetched = await fetchPage(raw);
    const context = buildContext(fetched);
    return { text: context.text.trim().slice(0, MAX_PASTED_TEXT) || null };
  } catch (error) {
    const message = error instanceof FetchError ? error.message : "Could not fetch that page.";
    return { error: `Could not read that job posting link: ${message}` };
  }
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

  const resolvedJobDescription = await resolveJobDescription(asPastedText(form.get("jobDescription")));
  if ("error" in resolvedJobDescription) {
    return NextResponse.json({ error: resolvedJobDescription.error }, { status: 502 });
  }

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
        // Opt-in: the draft is the author's own content and is stored with the report.
        rewrite: form.get("rewrite") === "true" && documentKind === "resume",
        jobDescription: resolvedJobDescription.text,
        coverLetterText: asPastedText(form.get("coverLetterText")),
        coverLetterDraft: form.get("coverLetterDraft") === "true" && documentKind === "resume",
        skillGapNotes: form.get("skillGapNotes") === "true" && documentKind === "resume",
        focus: form.get("focus") === "jobmatch" ? "jobmatch" : "full",
      },
    );

    const willSave = form.get("save") !== "false";
    // Only mint a fresh owner identity when there is actually something to tag with
    // it; a caller that opted out of saving gets a read-only cookie check instead.
    let ownerToken: string | null;
    if (willSave) {
      ownerToken = await ownerTokenForWrite();
      // A failed history write must not fail the analysis the user waited for.
      await saveAnalysis(analysis.result, ownerToken).catch(() => undefined);
    } else {
      ownerToken = await ownerTokenForRead();
    }

    const trend = await getTrend(
      trendKeyFor(analysis.result),
      analysis.result.kind,
      ownerToken,
    ).catch(() => []);

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
