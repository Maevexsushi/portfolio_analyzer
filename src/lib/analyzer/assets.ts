import { fetchAssetText, getResourceSize } from "@/lib/fetcher";
import { mapLimit } from "./concurrency";
import type { PageContext } from "./context";
import { resolveUrl } from "./context";

/**
 * Subresource inventory.
 *
 * The HTML alone cannot tell us how heavy a page is, so we take a sample: download the
 * stylesheets (their text also feeds the design review's palette and font checks) and
 * HEAD the largest-count resource types for transfer sizes. Deliberately a sample, not
 * a full crawl — `measuredCount` vs `resources.length` tells the UI how complete it is.
 */

export type ResourceType = "stylesheet" | "script" | "image" | "font" | "media" | "iframe";

export interface ResourceRef {
  url: string;
  type: ResourceType;
  sameOrigin: boolean;
  renderBlocking: boolean;
  bytes: number | null;
}

export interface AssetReport {
  resources: ResourceRef[];
  /** Concatenated text of the stylesheets we downloaded. */
  css: string;
  cssBytes: number;
  measuredBytes: number;
  measuredCount: number;
  stylesheetsFetched: number;
}

const MAX_STYLESHEET_FETCHES = 4;
const MAX_SIZE_PROBES = 12;

function pickFirstFromSrcset(srcset: string): string | null {
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first || null;
}

export function collectResourceRefs(ctx: PageContext): ResourceRef[] {
  const { $ } = ctx;
  const seen = new Set<string>();
  const resources: ResourceRef[] = [];

  const add = (href: string | undefined, type: ResourceType, renderBlocking = false) => {
    if (!href) return;
    const absolute = resolveUrl(href, ctx.finalUrl);
    if (!absolute || absolute.startsWith("data:")) return;
    const key = `${type}:${absolute}`;
    if (seen.has(key)) return;
    seen.add(key);
    resources.push({
      url: absolute,
      type,
      sameOrigin: Boolean(ctx.origin) && absolute.startsWith(ctx.origin),
      renderBlocking,
      bytes: null,
    });
  };

  $("link[rel='stylesheet'][href]").each((_, el) => {
    const media = ($(el).attr("media") ?? "").toLowerCase();
    // print-only and disabled sheets do not block the first render.
    const blocking = !/print|speech/.test(media) && $(el).attr("disabled") === undefined;
    add($(el).attr("href"), "stylesheet", blocking);
  });

  $("script[src]").each((_, el) => {
    const isDeferred =
      $(el).attr("async") !== undefined ||
      $(el).attr("defer") !== undefined ||
      ($(el).attr("type") ?? "") === "module";
    add($(el).attr("src"), "script", !isDeferred);
  });

  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (src) add(src, "image");
    else {
      const srcset = $(el).attr("srcset");
      if (srcset) add(pickFirstFromSrcset(srcset) ?? undefined, "image");
    }
  });

  $("source[srcset]").each((_, el) => {
    add(pickFirstFromSrcset($(el).attr("srcset") ?? "") ?? undefined, "image");
  });

  $("[style*='url(']").each((_, el) => {
    const match = /url\(['"]?([^'")]+)['"]?\)/i.exec($(el).attr("style") ?? "");
    if (match) add(match[1], "image");
  });

  $("link[rel='preload'][as='font'], link[rel='font']").each((_, el) => {
    add($(el).attr("href"), "font");
  });

  $("video[src], audio[src], video source[src]").each((_, el) => {
    add($(el).attr("src"), "media");
  });

  $("iframe[src]").each((_, el) => add($(el).attr("src"), "iframe"));

  return resources;
}

export async function collectAssets(ctx: PageContext): Promise<AssetReport> {
  const resources = collectResourceRefs(ctx);

  const stylesheets = resources
    .filter((resource) => resource.type === "stylesheet")
    .slice(0, MAX_STYLESHEET_FETCHES);

  const cssResults = await mapLimit(stylesheets, 4, async (resource) => {
    const result = await fetchAssetText(resource.url);
    if (result) resource.bytes = result.bytes;
    return result;
  });

  const css = cssResults
    .filter((result): result is { text: string; bytes: number } => result !== null)
    .map((result) => result.text)
    .join("\n");

  const cssBytes = stylesheets.reduce((sum, resource) => sum + (resource.bytes ?? 0), 0);

  // Spread the size-probe budget across types so one image-heavy page does not
  // consume it all and leave scripts unmeasured.
  const probeQueue: ResourceRef[] = [
    ...resources.filter((resource) => resource.type === "script").slice(0, 5),
    ...resources.filter((resource) => resource.type === "image").slice(0, 6),
    ...resources.filter((resource) => resource.type === "media").slice(0, 1),
  ].slice(0, MAX_SIZE_PROBES);

  await mapLimit(probeQueue, 6, async (resource) => {
    resource.bytes = await getResourceSize(resource.url);
  });

  const measured = resources.filter((resource) => resource.bytes !== null);

  return {
    resources,
    css,
    cssBytes,
    measuredBytes: measured.reduce((sum, resource) => sum + (resource.bytes ?? 0), 0),
    measuredCount: measured.length,
    stylesheetsFetched: cssResults.filter(Boolean).length,
  };
}
