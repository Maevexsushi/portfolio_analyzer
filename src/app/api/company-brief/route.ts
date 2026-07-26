import { NextResponse } from "next/server";
import { FetchError, fetchPage } from "@/lib/fetcher";
import { buildContext } from "@/lib/analyzer/context";
import { AiError, isAiConfigured } from "@/lib/ai/groq";
import { draftCompanyBrief, isEmptyCompanyBrief, type CompanyPageDigest } from "@/lib/ai/companybrief";

export const runtime = "nodejs";
/** Always hits the network for a fresh fetch; a stale cached briefing defeats the point. */
export const dynamic = "force-dynamic";

const MAX_URLS = 3;

/** HTTP status per fetch failure mode, so the UI can distinguish "bad URL" from "our fault". */
const STATUS_BY_CODE: Record<string, number> = {
  empty: 400,
  invalid: 400,
  scheme: 400,
  blocked: 400,
  dns: 400,
  "code-host": 400,
  "content-type": 415,
  forbidden: 502,
  http: 502,
  network: 502,
  redirect: 502,
  "empty-body": 502,
  timeout: 504,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { urls } = (body ?? {}) as { urls?: unknown };
  const list = Array.isArray(urls)
    ? urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];

  if (list.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one company page URL — its homepage, About, or Careers page." },
      { status: 400 },
    );
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured on this server, so a briefing cannot be written." },
      { status: 503 },
    );
  }

  const pages: CompanyPageDigest[] = [];
  const failed: { url: string; error: string; status: number }[] = [];

  for (const raw of list.slice(0, MAX_URLS)) {
    try {
      const fetched = await fetchPage(raw);
      const context = buildContext(fetched);
      pages.push({
        url: context.finalUrl,
        title: context.meta.title,
        description: context.meta.description,
        text: context.text,
      });
    } catch (error) {
      if (error instanceof FetchError) {
        failed.push({ url: raw, error: error.message, status: STATUS_BY_CODE[error.code] ?? 502 });
      } else {
        failed.push({ url: raw, error: "Could not fetch that page.", status: 500 });
      }
    }
  }

  if (pages.length === 0) {
    return NextResponse.json(
      { error: "None of the pages given could be fetched.", failed },
      { status: 502 },
    );
  }

  try {
    const brief = await draftCompanyBrief({ pages });
    if (isEmptyCompanyBrief(brief)) {
      return NextResponse.json(
        { error: "The pages given did not have enough on them to build a briefing.", failed },
        { status: 422 },
      );
    }
    return NextResponse.json({ brief, failed });
  } catch (error) {
    const code = error instanceof AiError ? error.code : "network";
    console.error("company brief failed", error);
    return NextResponse.json(
      { error: `Could not generate the briefing right now (${code}). Try again shortly.`, failed },
      { status: 502 },
    );
  }
}
