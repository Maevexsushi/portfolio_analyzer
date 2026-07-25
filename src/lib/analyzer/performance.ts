import type { Check, PerformanceReport, ResourceGroup } from "@/lib/types";
import type { AssetReport } from "./assets";
import { scoreFromChecks } from "./check-utils";
import type { PageContext } from "./context";

/**
 * Performance Report.
 *
 * This is a network-and-markup audit, not a Lighthouse run: no browser means no real
 * paint metrics. What it does measure is measured for real — server response time,
 * transfer sizes from Content-Length, request counts, compression and caching headers,
 * plus the markup patterns that cause slow first renders.
 */

const TYPE_LABELS: Record<string, string> = {
  stylesheet: "Stylesheets",
  script: "Scripts",
  image: "Images",
  font: "Fonts",
  media: "Video / audio",
  iframe: "Embeds",
};

function groupResources(assets: AssetReport): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  for (const resource of assets.resources) {
    const label = TYPE_LABELS[resource.type] ?? resource.type;
    const group =
      groups.get(label) ?? { type: label, count: 0, sameOrigin: 0, thirdParty: 0 };
    group.count += 1;
    if (resource.sameOrigin) group.sameOrigin += 1;
    else group.thirdParty += 1;
    groups.set(label, group);
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function analyzePerformance(ctx: PageContext, assets: AssetReport): PerformanceReport {
  const { $ } = ctx;
  const checks: Check[] = [];

  const renderBlockingScripts = assets.resources.filter(
    (resource) => resource.type === "script" && resource.renderBlocking,
  ).length;
  const renderBlockingStyles = assets.resources.filter(
    (resource) => resource.type === "stylesheet" && resource.renderBlocking,
  ).length;

  const images = $("img");
  const imagesTotal = images.length;
  const imagesLazy = images.filter((_, el) => $(el).attr("loading") === "lazy").length;
  const imagesMissingDimensions = images.filter((_, el) => {
    const node = $(el);
    const hasAttrs = node.attr("width") !== undefined && node.attr("height") !== undefined;
    const hasStyle = /(?:^|;)\s*(?:aspect-ratio|height)\s*:/i.test(node.attr("style") ?? "");
    return !hasAttrs && !hasStyle;
  }).length;

  const compression = ctx.headers["content-encoding"] ?? null;
  const cacheControl = ctx.headers["cache-control"] ?? null;
  const server = ctx.headers["server"] ?? null;
  const https = ctx.finalUrl.startsWith("https://");
  const requestCount = assets.resources.length + 1; // +1 for the document itself

  /* server response */
  checks.push({
    id: "perf-ttfb",
    label: "Server response time",
    status: ctx.ttfbMs <= 600 ? "pass" : ctx.ttfbMs <= 1500 ? "warn" : "fail",
    detail: `First byte arrived in ${ctx.ttfbMs} ms${
      ctx.ttfbMs > 600 ? " — over 600 ms is noticeable, check hosting or cold starts" : "."
    }`,
  });

  /* document weight */
  const htmlKb = ctx.htmlBytes / 1024;
  checks.push({
    id: "perf-html-size",
    label: "HTML document size",
    status: htmlKb <= 100 ? "pass" : htmlKb <= 300 ? "warn" : "fail",
    detail: `${htmlKb.toFixed(0)} KB of HTML${
      htmlKb > 100 ? " — large documents delay first paint, especially on mobile" : "."
    }`,
  });

  /* total measured weight */
  const totalBytes = ctx.htmlBytes + assets.measuredBytes;
  const totalKb = totalBytes / 1024;
  const unmeasured = assets.resources.length - assets.measuredCount;
  checks.push({
    id: "perf-page-weight",
    label: "Measured page weight",
    status: totalKb <= 1000 ? "pass" : totalKb <= 2500 ? "warn" : "fail",
    detail: `${totalKb.toFixed(0)} KB measured across the document and ${assets.measuredCount} subresource${
      assets.measuredCount === 1 ? "" : "s"
    }${unmeasured > 0 ? ` (${unmeasured} more not measured — this is a floor, not the total)` : ""}.`,
  });

  /* requests */
  checks.push({
    id: "perf-requests",
    label: "Request count",
    status: requestCount <= 40 ? "pass" : requestCount <= 80 ? "warn" : "fail",
    detail: `${requestCount} requests referenced by the HTML${
      requestCount > 40 ? " — bundle or defer what you can" : "."
    }`,
  });

  /* render blocking */
  checks.push({
    id: "perf-blocking-scripts",
    label: "No render-blocking scripts",
    status: renderBlockingScripts === 0 ? "pass" : renderBlockingScripts <= 2 ? "warn" : "fail",
    detail:
      renderBlockingScripts === 0
        ? "All external scripts are async, deferred, or modules."
        : `${renderBlockingScripts} synchronous <script src> tag${
            renderBlockingScripts === 1 ? "" : "s"
          } block parsing — add defer or async.`,
  });

  checks.push({
    id: "perf-blocking-styles",
    label: "Stylesheet count",
    status: renderBlockingStyles <= 2 ? "pass" : renderBlockingStyles <= 4 ? "warn" : "fail",
    detail: `${renderBlockingStyles} render-blocking stylesheet${
      renderBlockingStyles === 1 ? "" : "s"
    }${renderBlockingStyles > 2 ? " — each one delays first paint" : "."}`,
  });

  /* images */
  checks.push({
    id: "perf-lazy-images",
    label: "Off-screen images lazy-loaded",
    status:
      imagesTotal <= 3
        ? "pass"
        : imagesLazy / imagesTotal >= 0.5
          ? "pass"
          : imagesLazy > 0
            ? "warn"
            : "fail",
    detail:
      imagesTotal === 0
        ? "No images to lazy-load."
        : `${imagesLazy} of ${imagesTotal} images use loading="lazy"${
            imagesTotal > 3 && imagesLazy === 0
              ? " — add it to everything below the fold"
              : "."
          }`,
  });

  checks.push({
    id: "perf-image-dimensions",
    label: "Images have dimensions",
    status:
      imagesTotal === 0
        ? "pass"
        : imagesMissingDimensions === 0
          ? "pass"
          : imagesMissingDimensions / imagesTotal <= 0.34
            ? "warn"
            : "fail",
    detail:
      imagesTotal === 0
        ? "No images on the page."
        : `${imagesMissingDimensions} of ${imagesTotal} images have no width/height or aspect-ratio${
            imagesMissingDimensions > 0 ? " — this causes layout shift as they load" : ""
          }.`,
  });

  const modernFormats = assets.resources.filter(
    (resource) => resource.type === "image" && /\.(webp|avif)(\?|$)/i.test(resource.url),
  ).length;
  const rasterImages = assets.resources.filter(
    (resource) => resource.type === "image" && /\.(png|jpe?g|gif)(\?|$)/i.test(resource.url),
  ).length;
  if (rasterImages > 0) {
    checks.push({
      id: "perf-image-formats",
      label: "Modern image formats",
      status: modernFormats >= rasterImages ? "pass" : modernFormats > 0 ? "warn" : "fail",
      detail: `${rasterImages} PNG/JPEG image${rasterImages === 1 ? "" : "s"} and ${modernFormats} WebP/AVIF${
        modernFormats < rasterImages ? " — converting to WebP typically saves 25-50%" : ""
      }.`,
    });
  }

  const heaviest = assets.resources
    .filter((resource) => resource.bytes !== null)
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))[0];
  if (heaviest && (heaviest.bytes ?? 0) > 500 * 1024) {
    checks.push({
      id: "perf-heavy-asset",
      label: "No oversized assets",
      status: (heaviest.bytes ?? 0) > 1024 * 1024 ? "fail" : "warn",
      detail: `Largest measured asset is ${((heaviest.bytes ?? 0) / 1024).toFixed(0)} KB: ${
        heaviest.url.split("/").pop() ?? heaviest.url
      }`,
    });
  }

  /* inline payloads */
  const inlineKb = (ctx.inlineScriptBytes + ctx.inlineStyleBytes) / 1024;
  checks.push({
    id: "perf-inline-payload",
    label: "Inline script/style size",
    status: inlineKb <= 50 ? "pass" : inlineKb <= 150 ? "warn" : "fail",
    detail: `${inlineKb.toFixed(0)} KB of inline CSS and JS${
      inlineKb > 50 ? " — inline code cannot be cached between visits" : "."
    }`,
  });

  /* delivery */
  checks.push({
    id: "perf-compression",
    label: "Response compression",
    status: compression ? "pass" : "fail",
    detail: compression
      ? `Served with ${compression}.`
      : "No Content-Encoding header — HTML is being sent uncompressed. Enabling gzip or brotli is usually a one-line config change.",
  });

  const maxAge = /max-age=(\d+)/.exec(cacheControl ?? "");
  checks.push({
    id: "perf-caching",
    label: "Caching headers",
    status: maxAge && Number(maxAge[1]) >= 3600 ? "pass" : cacheControl ? "warn" : "fail",
    detail: cacheControl
      ? `Cache-Control: ${cacheControl}`
      : "No Cache-Control header, so repeat visits re-download everything.",
  });

  checks.push({
    id: "perf-https",
    label: "Served over HTTPS",
    status: https ? "pass" : "fail",
    detail: https
      ? "Served over HTTPS."
      : "Served over plain HTTP — browsers show a 'Not secure' warning next to your URL.",
  });

  const thirdPartyCount = assets.resources.filter((resource) => !resource.sameOrigin).length;
  checks.push({
    id: "perf-third-party",
    label: "Third-party requests",
    status: thirdPartyCount <= 8 ? "pass" : thirdPartyCount <= 20 ? "warn" : "fail",
    detail: `${thirdPartyCount} request${thirdPartyCount === 1 ? "" : "s"} to other origins${
      thirdPartyCount > 8 ? " — each one adds a DNS lookup and TLS handshake" : "."
    }`,
  });

  const score = scoreFromChecks(checks, {
    "perf-ttfb": 2.5,
    "perf-html-size": 1.5,
    "perf-page-weight": 2.5,
    "perf-requests": 1.5,
    "perf-blocking-scripts": 2,
    "perf-blocking-styles": 1,
    "perf-lazy-images": 1.5,
    "perf-image-dimensions": 1.5,
    "perf-image-formats": 1.5,
    "perf-heavy-asset": 1.5,
    "perf-inline-payload": 1,
    "perf-compression": 2,
    "perf-caching": 1.5,
    "perf-https": 2.5,
    "perf-third-party": 1,
  });

  return {
    score,
    htmlBytes: ctx.htmlBytes,
    ttfbMs: ctx.ttfbMs,
    downloadMs: ctx.downloadMs,
    requestCount,
    resources: groupResources(assets),
    renderBlockingScripts,
    renderBlockingStyles,
    inlineStyleBytes: ctx.inlineStyleBytes,
    inlineScriptBytes: ctx.inlineScriptBytes,
    imagesTotal,
    imagesLazy,
    imagesMissingDimensions,
    compression,
    cacheControl,
    server,
    https,
    checks,
  };
}
