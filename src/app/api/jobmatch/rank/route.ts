import { NextResponse } from "next/server";
import { ExtractError, extractDocument, MAX_UPLOAD_BYTES } from "@/lib/intake";
import { FetchError, fetchPage } from "@/lib/fetcher";
import { buildContext } from "@/lib/analyzer/context";
import { detectDiscipline } from "@/lib/discipline/detect";
import { DISCIPLINE_ORDER, profileFor } from "@/lib/discipline/profiles";
import { composeVocabulary, matchSkills, skillsRegionFromLines } from "@/lib/discipline/skills";
import { isPostingUrl, rankPostings, splitPostings, type ResolvedPosting } from "@/lib/jobmatch/rank";
import type { DisciplineKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reverse job matching: one resume, several postings, ranked by fit.
 *
 * Deliberately its own lightweight route rather than a mode of the main analyzer. It
 * needs none of the machinery that produces a stored, scored ResumeResult — no ATS
 * check, no experience or writing score, no PDF export, no history entry — this is a
 * scratch comparison the reader runs once and reads, not a report anyone comes back to.
 * The resume's bytes are extracted in memory for the one skill-match pass and dropped,
 * same as every other upload path.
 */

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

export interface FailedPostingFetch {
  url: string;
  error: string;
}

/**
 * Resolves each split chunk into the posting text to actually match against: fetched
 * fresh through the same SSRF-guarded fetcher the website analyzer uses when the whole
 * chunk is a bare link, or used as-is when it is pasted text. Fetches run concurrently
 * — nobody should wait out ten sequential 15-second timeouts because one link hung —
 * and a page that fails to fetch is reported by name rather than silently dropping the
 * whole request; ranking still runs on whatever did resolve.
 */
async function resolvePostings(
  chunks: string[],
): Promise<{ resolved: ResolvedPosting[]; failed: FailedPostingFetch[] }> {
  const settled = await Promise.all(
    chunks.map(async (chunk): Promise<ResolvedPosting | FailedPostingFetch> => {
      if (!isPostingUrl(chunk)) return { text: chunk, sourceUrl: null };
      try {
        const fetched = await fetchPage(chunk);
        const context = buildContext(fetched);
        return { text: context.text, sourceUrl: context.finalUrl };
      } catch (error) {
        const message = error instanceof FetchError ? error.message : "Could not fetch that page.";
        return { url: chunk, error: message };
      }
    }),
  );

  const resolved: ResolvedPosting[] = [];
  const failed: FailedPostingFetch[] = [];
  for (const item of settled) {
    if ("text" in item) resolved.push(item);
    else failed.push(item);
  }
  return { resolved, failed };
}

function asDiscipline(value: unknown): DisciplineKey | null {
  return typeof value === "string" && (DISCIPLINE_ORDER as string[]).includes(value)
    ? (value as DisciplineKey)
    : null;
}

/** Several postings concatenated behind `---` lines; generous but not unbounded. */
const MAX_POSTINGS_TEXT = 60_000;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No resume file was included in the upload." }, { status: 400 });
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

  const postingsRaw = form.get("postings");
  const postingsText = typeof postingsRaw === "string" ? postingsRaw.slice(0, MAX_POSTINGS_TEXT) : "";
  const { postings: chunks, droppedCount } = splitPostings(postingsText);
  if (chunks.length === 0) {
    return NextResponse.json(
      {
        error:
          "Paste at least one job posting, or its link. Separate several with a line of three or more dashes (---).",
      },
      { status: 400 },
    );
  }

  const { resolved, failed } = await resolvePostings(chunks);
  if (resolved.length === 0) {
    return NextResponse.json(
      { error: "None of the posting links given could be fetched.", failed },
      { status: 502 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await extractDocument({
      fileName: file.name.split(/[\\/]/).pop() || "upload",
      bytes,
    });

    const discipline = detectDiscipline(document.text, { chosen: asDiscipline(form.get("discipline")) });
    const profile = profileFor(discipline.key);
    const resumeSkills = matchSkills(
      document.lowerText,
      skillsRegionFromLines(document.lines),
      composeVocabulary(profile),
    );

    const ranked = rankPostings(resolved, profile, resumeSkills);

    return NextResponse.json({
      discipline: { key: discipline.key, label: discipline.label },
      droppedCount,
      failed,
      postings: ranked,
    });
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json(
        { error: error.message, code: error.code, suggestion: error.suggestion },
        { status: STATUS_BY_CODE[error.code] ?? 422 },
      );
    }
    console.error("rank postings failed", error);
    return NextResponse.json(
      { error: "Something went wrong while reading that file." },
      { status: 500 },
    );
  }
}
