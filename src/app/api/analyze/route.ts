import { NextResponse } from "next/server";
import { FetchError, analyzePortfolio } from "@/lib/analyzer";
import { getTrend, saveAnalysis } from "@/lib/history";

export const runtime = "nodejs";
/** Analysis always hits the network; never let a response be cached. */
export const dynamic = "force-dynamic";

/** HTTP status per fetch failure mode, so the UI can distinguish "bad URL" from "our fault". */
const STATUS_BY_CODE: Record<string, number> = {
  empty: 400,
  invalid: 400,
  scheme: 400,
  blocked: 400,
  dns: 400,
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

  const { url, checkLinks, save } = (body ?? {}) as {
    url?: unknown;
    checkLinks?: unknown;
    save?: unknown;
  };

  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "Provide a portfolio URL to analyze." }, { status: 400 });
  }
  if (url.length > 2048) {
    return NextResponse.json({ error: "That URL is too long." }, { status: 400 });
  }

  try {
    const result = await analyzePortfolio(url, {
      checkLinks: checkLinks !== false,
    });

    if (save !== false) {
      // A failed history write must not fail the analysis the user waited for.
      await saveAnalysis(result).catch(() => undefined);
    }

    const trend = await getTrend(result.finalUrl).catch(() => []);
    return NextResponse.json({ result, trend });
  } catch (error) {
    if (error instanceof FetchError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: STATUS_BY_CODE[error.code] ?? 502 },
      );
    }
    console.error("analyze failed", error);
    return NextResponse.json(
      { error: "Something went wrong while analyzing that page." },
      { status: 500 },
    );
  }
}
