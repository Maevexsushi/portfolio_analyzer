import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AnyResult, HistoryEntry } from "./types";

/**
 * Analysis history — a Supabase (Postgres) table.
 *
 * This used to be a JSON file under ./data, which worked fine for `next dev` but
 * silently failed on Vercel: serverless functions there run on a read-only
 * filesystem, so every write threw, was swallowed on purpose (a storage hiccup must
 * never fail the analysis the user just waited for), and every report vanished the
 * moment you navigated away from it. See supabase/migrations for the table this
 * reads and writes.
 *
 * The Supabase client is REST-based rather than a pooled Postgres connection, so
 * creating one per call (cached at module scope) is the right shape here — there is
 * no connection to exhaust across serverless invocations.
 *
 * Every list/delete-all operation is scoped to an anonymous owner token (see
 * src/lib/ownerToken.ts) so one visitor never sees another's history. A single
 * report — getAnalysis by id, and everything downstream of it (the report page,
 * PDF export, trend for that one report) — stays unscoped on purpose: an id is
 * meant to be sharable by whoever holds the link, the same trust model a "anyone
 * with the link" share uses.
 */

const MAX_ENTRIES = 50;
const TABLE = "analyses";

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY must be set to store analysis history — see .env.example.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

interface AnalysisRow {
  id: string;
  kind: AnyResult["kind"];
  url: string;
  final_url: string;
  title: string;
  analyzed_at: string;
  overall_score: number;
  grade: string;
}

/**
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

function rowToEntry(row: AnalysisRow): HistoryEntry {
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    finalUrl: row.final_url,
    title: row.title,
    analyzedAt: row.analyzed_at,
    overallScore: row.overall_score,
    grade: row.grade,
  };
}

/** Deletes one owner's rows beyond their most recent MAX_ENTRIES, oldest first. */
async function trim(sb: SupabaseClient, ownerToken: string): Promise<void> {
  const { data: overflow, error } = await sb
    .from(TABLE)
    .select("id")
    .eq("owner_token", ownerToken)
    .order("created_at", { ascending: false })
    .range(MAX_ENTRIES, MAX_ENTRIES + 999);
  if (error || !overflow || overflow.length === 0) return;
  await sb.from(TABLE).delete().in("id", overflow.map((row) => (row as { id: string }).id));
}

export async function saveAnalysis(result: AnyResult, ownerToken: string): Promise<void> {
  const sb = client();
  const identity = identityOf(result);
  const { error } = await sb.from(TABLE).insert({
    id: result.id,
    kind: result.kind,
    url: identity.url,
    final_url: identity.finalUrl,
    title: identity.title,
    analyzed_at: result.analyzedAt,
    overall_score: result.overallScore,
    grade: result.grade,
    data: result,
    owner_token: ownerToken,
  });
  if (error) throw new Error(error.message);
  await trim(sb, ownerToken);
}

/** A visitor with no owner cookie yet has, by definition, an empty history. */
export async function listHistory(ownerToken: string | null): Promise<HistoryEntry[]> {
  if (!ownerToken) return [];
  const { data, error } = await client()
    .from(TABLE)
    .select("id, kind, url, final_url, title, analyzed_at, overall_score, grade")
    .eq("owner_token", ownerToken)
    .order("created_at", { ascending: false })
    .limit(MAX_ENTRIES);
  if (error) throw new Error(error.message);
  return (data as AnalysisRow[] | null ?? []).map(rowToEntry);
}

/** Unscoped by owner: a report's id is meant to be sharable by whoever holds it. */
export async function getAnalysis(id: string): Promise<AnyResult | null> {
  const { data, error } = await client()
    .from(TABLE)
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { data: AnyResult } | null)?.data ?? null;
}

/** Whoever's history a stored report belongs to, so its own trend line stays scoped
 * to that owner regardless of who is viewing the shared report link. */
export async function getOwnerToken(id: string): Promise<string | null> {
  const { data, error } = await client().from(TABLE).select("owner_token").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { owner_token: string | null } | null)?.owner_token ?? null;
}

/**
 * All past scores for the same subject, oldest first — powers the trend line.
 *
 * Matching is scoped to one kind so an uploaded resume named "portfolio.pdf" cannot
 * land on the trend for a website at portfolio.pdf, and to one owner so a stranger's
 * separately-run "resume.pdf" cannot land on yours. The whole kind+owner is fetched
 * and filtered by subject in code rather than pushed into the query as an `or=`
 * filter string, since a URL can contain characters (commas, parentheses) that would
 * need careful escaping to be safe inside PostgREST's filter syntax — one owner's
 * rows are capped at MAX_ENTRIES, so filtering in memory costs nothing.
 */
export async function getTrend(
  subject: string,
  kind: AnyResult["kind"],
  ownerToken: string | null,
): Promise<{ analyzedAt: string; overallScore: number; id: string }[]> {
  if (!ownerToken) return [];
  const { data, error } = await client()
    .from(TABLE)
    .select("id, url, final_url, analyzed_at, overall_score")
    .eq("kind", kind)
    .eq("owner_token", ownerToken)
    .order("analyzed_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as AnalysisRow[] | null ?? [])
    .filter((row) => row.final_url === subject || row.url === subject)
    .map((row) => ({ id: row.id, analyzedAt: row.analyzed_at, overallScore: row.overall_score }));
}

/** The subject string `getTrend` keys on, for callers holding a whole result. */
export function trendKeyFor(result: AnyResult): string {
  return identityOf(result).finalUrl;
}

export async function deleteAnalysis(id: string, ownerToken: string): Promise<boolean> {
  const { data, error } = await client()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("owner_token", ownerToken)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function clearHistory(ownerToken: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq("owner_token", ownerToken);
  if (error) throw new Error(error.message);
}
