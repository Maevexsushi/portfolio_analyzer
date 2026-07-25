import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { FetchedPage } from "@/lib/fetcher";
import type { AnalysisMeta, HeadingNode } from "@/lib/types";

/**
 * Parses the fetched HTML once and exposes the derived views every analyzer needs.
 * Cheerio parsing and full-text extraction are the two expensive steps, so they
 * happen here exactly once rather than per module.
 */
export interface PageContext {
  $: cheerio.CheerioAPI;
  html: string;
  finalUrl: string;
  origin: string;
  headers: Record<string, string>;
  htmlBytes: number;
  ttfbMs: number;
  downloadMs: number;
  /** Visible text with whitespace collapsed. */
  text: string;
  lowerText: string;
  headings: HeadingNode[];
  meta: AnalysisMeta;
  /** CSS from <style> blocks plus any stylesheets we managed to download. */
  css: string;
  inlineStyleBytes: number;
  inlineScriptBytes: number;
}

export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function collapse(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function wordCount(input: string): number {
  const trimmed = collapse(input);
  return trimmed ? trimmed.split(" ").length : 0;
}

function extractMeta($: cheerio.CheerioAPI, finalUrl: string): AnalysisMeta {
  const metaContent = (selector: string): string => {
    const value = $(selector).first().attr("content");
    return value ? collapse(value) : "";
  };

  const title =
    collapse($("title").first().text()) ||
    metaContent('meta[property="og:title"]') ||
    "";

  const description =
    metaContent('meta[name="description"]') ||
    metaContent('meta[property="og:description"]') ||
    "";

  const ogImageRaw =
    metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]');

  const faviconRaw =
    $('link[rel~="icon"]').first().attr("href") ??
    $('link[rel="shortcut icon"]').first().attr("href") ??
    $('link[rel="apple-touch-icon"]').first().attr("href") ??
    null;

  return {
    title,
    description,
    ogImage: ogImageRaw ? resolveUrl(ogImageRaw, finalUrl) : null,
    favicon: faviconRaw ? resolveUrl(faviconRaw, finalUrl) : null,
    lang: $("html").attr("lang")?.trim() || null,
    author: metaContent('meta[name="author"]') || null,
  };
}

export function buildContext(page: FetchedPage, extraCss = ""): PageContext {
  const $ = cheerio.load(page.html);

  // Style/script/template content is not visible copy — strip it from the text view,
  // but measure it first for the performance report.
  let inlineStyleBytes = 0;
  $("style").each((_, el) => {
    inlineStyleBytes += Buffer.byteLength($(el).text(), "utf8");
  });

  let inlineScriptBytes = 0;
  $("script:not([src])").each((_, el) => {
    inlineScriptBytes += Buffer.byteLength($(el).text(), "utf8");
  });

  const styleBlocks = $("style")
    .map((_, el) => $(el).text())
    .get()
    .join("\n");

  const inlineStyleAttrs = $("[style]")
    .map((_, el) => $(el).attr("style") ?? "")
    .get()
    .join(";");

  const headings: HeadingNode[] = $("h1, h2, h3, h4, h5, h6")
    .map((_, el) => {
      const tag = (el as { tagName?: string }).tagName ?? "h6";
      return {
        level: Number(tag.replace(/\D/g, "")) || 6,
        text: collapse($(el).text()).slice(0, 160),
      };
    })
    .get()
    .filter((heading) => heading.text.length > 0);

  const meta = extractMeta($, page.finalUrl);

  // Text view: drop non-content nodes so keyword matching does not hit minified JS.
  const $text = cheerio.load(page.html);
  $text("script, style, noscript, template, svg, iframe").remove();
  const text = collapse($text("body").text() || $text.root().text());

  let origin = "";
  try {
    origin = new URL(page.finalUrl).origin;
  } catch {
    origin = "";
  }

  return {
    $,
    html: page.html,
    finalUrl: page.finalUrl,
    origin,
    headers: page.headers,
    htmlBytes: page.bytes,
    ttfbMs: page.ttfbMs,
    downloadMs: page.downloadMs,
    text,
    lowerText: text.toLowerCase(),
    headings,
    meta,
    css: [styleBlocks, inlineStyleAttrs, extraCss].filter(Boolean).join("\n"),
    inlineStyleBytes,
    inlineScriptBytes,
  };
}

/**
 * Attribute soup that hints at a section's purpose: id, class, aria-label, data-*.
 * Section and skill detection both key off this.
 */
export function selectorHints($: cheerio.CheerioAPI, el: Element): string {
  const node = $(el);
  return [
    node.attr("id") ?? "",
    node.attr("class") ?? "",
    node.attr("aria-label") ?? "",
    node.attr("data-section") ?? "",
    node.attr("name") ?? "",
  ]
    .join(" ")
    .toLowerCase();
}
