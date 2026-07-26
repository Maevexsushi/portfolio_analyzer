import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, AnyResult, HistoryEntry } from "./types";

/**
 * Analysis History — a JSON file store under ./data.
 *
 * A file is the right size of tool here: single-user, local, no login, and the whole
 * history is small enough to read at once. Writes are serialised through an in-process
 * queue and land via temp-file rename so a crash mid-write cannot truncate the store.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "history.json");
const MAX_ENTRIES = 50;

interface StoreShape {
  version: 1;
  analyses: AnyResult[];
}

/**
 * What a stored analysis was of, for the history list and the trend lookup.
 *
 * A website is identified by its URL; an upload has none, so it is identified by the
 * file name. Trend only ever compares like with like — two analyses of the same URL,
 * or two uploads of the same file name — because charting a resume's score against a
 * website's would be a line with no meaning.
 */
function identityOf(result: AnyResult): { url: string; finalUrl: string; title: string } {
  if (result.kind === "website") {
    return {
      url: result.url,
      finalUrl: result.finalUrl,
      title: result.meta.title || result.finalUrl,
    };
  }
  return {
    url: result.upload.fileName,
    finalUrl: result.upload.fileName,
    title: result.upload.fileName,
  };
}

const EMPTY: StoreShape = { version: 1, analyses: [] };

/** Serialises writes; concurrent requests would otherwise clobber each other. */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => {});
  return result;
}

/**
 * Bring a stored record up to the current shape.
 *
 * Analyses written before uploads existed carry no `kind`, and every branch in the app
 * keys off it — so without this, opening an old report crashes on `result.upload`. A
 * record from that era can only be a website, which is the one kind there was.
 *
 * Migrating on read rather than rewriting the file keeps this a pure function of what
 * is on disk: no write happens because someone opened a page, and a downgrade cannot
 * strand data in a shape the older code will not accept.
 */
const UNKNOWN_DISCIPLINE: AnyResult["discipline"] = {
  key: "general",
  label: "General",
  blurb: "This report predates field detection, so it was scored against general expectations.",
  confidence: 0,
  evidence: [],
  alternative: null,
  chosen: false,
};

function migrate(record: AnyResult): AnyResult {
  if (record.kind && record.discipline) return record;
  // Only websites existed before either field did, so that is what an old record is.
  return {
    ...(record as AnalysisResult),
    kind: "website",
    discipline: record.discipline ?? UNKNOWN_DISCIPLINE,
  };
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.analyses)) return { ...EMPTY };
    return { ...parsed, analyses: parsed.analyses.map(migrate) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ...EMPTY };
    // A corrupt store should not take the app down — start fresh instead.
    return { ...EMPTY };
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await rename(temporary, STORE_PATH);
}

function toEntry(result: AnyResult): HistoryEntry {
  const identity = identityOf(result);
  return {
    id: result.id,
    kind: result.kind,
    url: identity.url,
    finalUrl: identity.finalUrl,
    title: identity.title,
    analyzedAt: result.analyzedAt,
    overallScore: result.overallScore,
    grade: result.grade,
  };
}

export async function saveAnalysis(result: AnyResult): Promise<void> {
  await enqueue(async () => {
    const store = await readStore();
    store.analyses.unshift(result);
    store.analyses = store.analyses.slice(0, MAX_ENTRIES);
    await writeStore(store);
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const store = await readStore();
  return store.analyses.map(toEntry);
}

export async function getAnalysis(id: string): Promise<AnyResult | null> {
  const store = await readStore();
  return store.analyses.find((analysis) => analysis.id === id) ?? null;
}

/**
 * All past scores for the same subject, oldest first — powers the trend line.
 *
 * Matching is scoped to one kind so an uploaded resume named "portfolio.pdf" cannot
 * land on the trend for a website at portfolio.pdf, and so the line always compares
 * runs that were scored by the same set of checks.
 */
export async function getTrend(
  subject: string,
  kind: AnyResult["kind"] = "website",
): Promise<{ analyzedAt: string; overallScore: number; id: string }[]> {
  const store = await readStore();
  return store.analyses
    .filter((analysis) => {
      if (analysis.kind !== kind) return false;
      const identity = identityOf(analysis);
      return identity.finalUrl === subject || identity.url === subject;
    })
    .map((analysis) => ({
      id: analysis.id,
      analyzedAt: analysis.analyzedAt,
      overallScore: analysis.overallScore,
    }))
    .reverse();
}

/** The subject string `getTrend` keys on, for callers holding a whole result. */
export function trendKeyFor(result: AnyResult): string {
  return identityOf(result).finalUrl;
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  return enqueue(async () => {
    const store = await readStore();
    const before = store.analyses.length;
    store.analyses = store.analyses.filter((analysis) => analysis.id !== id);
    if (store.analyses.length === before) return false;
    await writeStore(store);
    return true;
  });
}

export async function clearHistory(): Promise<void> {
  await enqueue(async () => writeStore({ ...EMPTY }));
}
