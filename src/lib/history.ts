import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, HistoryEntry } from "./types";

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
  analyses: AnalysisResult[];
}

const EMPTY: StoreShape = { version: 1, analyses: [] };

/** Serialises writes; concurrent requests would otherwise clobber each other. */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => {});
  return result;
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.analyses)) return { ...EMPTY };
    return parsed;
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

function toEntry(result: AnalysisResult): HistoryEntry {
  return {
    id: result.id,
    url: result.url,
    finalUrl: result.finalUrl,
    title: result.meta.title || result.finalUrl,
    analyzedAt: result.analyzedAt,
    overallScore: result.overallScore,
    grade: result.grade,
  };
}

export async function saveAnalysis(result: AnalysisResult): Promise<void> {
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

export async function getAnalysis(id: string): Promise<AnalysisResult | null> {
  const store = await readStore();
  return store.analyses.find((analysis) => analysis.id === id) ?? null;
}

/** All past scores for a URL, oldest first — powers the trend line on the results page. */
export async function getTrend(
  url: string,
): Promise<{ analyzedAt: string; overallScore: number; id: string }[]> {
  const store = await readStore();
  return store.analyses
    .filter((analysis) => analysis.finalUrl === url || analysis.url === url)
    .map((analysis) => ({
      id: analysis.id,
      analyzedAt: analysis.analyzedAt,
      overallScore: analysis.overallScore,
    }))
    .reverse();
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
