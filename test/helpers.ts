import type { FetchedPage } from "@/lib/fetcher";
import { buildContext, type PageContext } from "@/lib/analyzer/context";
import type { AssetReport } from "@/lib/analyzer/assets";
import { collectResourceRefs } from "@/lib/analyzer/assets";

/**
 * Test helpers.
 *
 * Every analyzer module is a pure function of a PageContext, so tests build one from
 * an HTML string instead of going over the network. That keeps the suite fast and, more
 * importantly, deterministic — the accuracy checks are asserting on markup patterns,
 * not on whatever a live site happens to be serving today.
 */

export function makePage(html: string, overrides: Partial<FetchedPage> = {}): FetchedPage {
  return {
    html,
    finalUrl: "https://portfolio.example/",
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-encoding": "gzip",
      "cache-control": "public, max-age=3600",
      ...overrides.headers,
    },
    bytes: Buffer.byteLength(html, "utf8"),
    ttfbMs: 120,
    downloadMs: 30,
    redirectChain: [],
    truncated: false,
    ...overrides,
  };
}

/** Build a context, optionally with stylesheet text that would have come from assets. */
export function ctxFrom(html: string, css = "", overrides: Partial<FetchedPage> = {}): PageContext {
  return buildContext(makePage(html, overrides), css);
}

/** An AssetReport for the page's own subresources, with nothing measured. */
export function assetsFrom(ctx: PageContext, css = ""): AssetReport {
  const resources = collectResourceRefs(ctx);
  return {
    resources,
    css,
    cssBytes: Buffer.byteLength(css, "utf8"),
    measuredBytes: 0,
    measuredCount: 0,
    stylesheetsFetched: css ? 1 : 0,
  };
}

/** Status of one check by id — the unit most assertions are written against. */
export function statusOf(checks: { id: string; status: string }[], id: string): string {
  const check = checks.find((entry) => entry.id === id);
  if (!check) throw new Error(`no check with id "${id}" (have: ${checks.map((c) => c.id).join(", ")})`);
  return check.status;
}

export function detailOf(checks: { id: string; detail: string }[], id: string): string {
  const check = checks.find((entry) => entry.id === id);
  if (!check) throw new Error(`no check with id "${id}"`);
  return check.detail;
}

/** Minimal well-formed page other fixtures extend, so unrelated checks stay quiet. */
export function shell(body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ada Okonkwo — Full-Stack Developer</title>
<meta name="description" content="Full-stack developer building accessible web applications with TypeScript and Postgres.">
${head}</head><body>${body}</body></html>`;
}
