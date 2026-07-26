import { describe, expect, it } from "vitest";
import { analyzePerformance } from "@/lib/analyzer/performance";
import type { AssetReport, ResourceRef } from "@/lib/analyzer/assets";
import { assetsFrom, ctxFrom, detailOf, shell, statusOf } from "./helpers";

function asset(url: string, cacheControl: string | null, bytes = 1024): ResourceRef {
  return {
    url,
    type: url.endsWith(".css") ? "stylesheet" : "script",
    sameOrigin: true,
    renderBlocking: false,
    bytes,
    cacheControl,
  };
}

function withAssets(resources: ResourceRef[]): AssetReport {
  return {
    resources,
    css: "",
    cssBytes: 0,
    measuredBytes: resources.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    measuredCount: resources.filter((r) => r.bytes !== null).length,
    stylesheetsFetched: 0,
  };
}

const page = shell('<h1>Ada</h1><p>Some copy.</p><img src="/a.webp" alt="a" width="10" height="10">');

describe("caching check", () => {
  /*
   * `max-age=0, must-revalidate` on an HTML document is correct — the page should be
   * re-checked so deploys are picked up. Grading the document told correctly configured
   * sites to "add caching headers"; what matters is the fingerprinted assets.
   */
  it("passes when static assets are cached for a long time, whatever the document says", () => {
    const ctx = ctxFrom(page, "", { headers: { "cache-control": "public, max-age=0, must-revalidate" } });
    const report = analyzePerformance(
      ctx,
      withAssets([
        asset("https://portfolio.example/a.css", "public, max-age=31536000, immutable"),
        asset("https://portfolio.example/b.js", "public, max-age=31536000, immutable"),
      ]),
    );
    expect(statusOf(report.checks, "perf-caching")).toBe("pass");
    expect(detailOf(report.checks, "perf-caching")).toMatch(/1 year/);
  });

  it("fails when assets are served with no-store", () => {
    const ctx = ctxFrom(page);
    const report = analyzePerformance(
      ctx,
      withAssets([
        asset("https://portfolio.example/a.css", "no-store"),
        asset("https://portfolio.example/b.js", "no-cache"),
      ]),
    );
    expect(statusOf(report.checks, "perf-caching")).toBe("fail");
  });

  it("warns when only some assets are cached", () => {
    const ctx = ctxFrom(page);
    const report = analyzePerformance(
      ctx,
      withAssets([
        asset("https://portfolio.example/a.css", "public, max-age=600"),
        asset("https://portfolio.example/b.js", "no-store"),
      ]),
    );
    expect(statusOf(report.checks, "perf-caching")).toBe("warn");
  });

  it("does not blame the document when no assets were measured", () => {
    const ctx = ctxFrom(page, "", { headers: { "cache-control": "public, max-age=0, must-revalidate" } });
    const report = analyzePerformance(ctx, withAssets([]));
    expect(statusOf(report.checks, "perf-caching")).toBe("pass");
    expect(detailOf(report.checks, "perf-caching")).toMatch(/normal/);
  });

  it("warns when the document has no cache header and nothing was measured", () => {
    const ctx = ctxFrom(page, "", { headers: { "cache-control": "" } });
    const report = analyzePerformance(ctx, withAssets([]));
    expect(statusOf(report.checks, "perf-caching")).toBe("warn");
  });
});

describe("delivery checks", () => {
  it("flags a missing content-encoding", () => {
    const ctx = ctxFrom(page, "", { headers: { "content-encoding": "" } });
    const report = analyzePerformance(ctx, assetsFrom(ctx));
    expect(statusOf(report.checks, "perf-compression")).toBe("fail");
  });

  it("flags plain HTTP", () => {
    const ctx = ctxFrom(page, "", { finalUrl: "http://portfolio.example/" });
    const report = analyzePerformance(ctx, assetsFrom(ctx));
    expect(statusOf(report.checks, "perf-https")).toBe("fail");
    expect(report.https).toBe(false);
  });

  it("counts render-blocking scripts but not deferred or module ones", () => {
    const html = shell(
      '<h1>Ada</h1><script src="/a.js"></script><script src="/b.js" defer></script><script src="/c.js" type="module"></script>',
    );
    const ctx = ctxFrom(html);
    const report = analyzePerformance(ctx, assetsFrom(ctx));
    expect(report.renderBlockingScripts).toBe(1);
  });

  it("reports measured weight as a floor when resources were not measured", () => {
    const html = shell('<h1>Ada</h1><img src="/a.webp" alt="a"><img src="/b.webp" alt="b">');
    const ctx = ctxFrom(html);
    const report = analyzePerformance(ctx, assetsFrom(ctx));
    expect(detailOf(report.checks, "perf-page-weight")).toMatch(/not measured|floor/);
  });
});
