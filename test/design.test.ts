import { describe, expect, it } from "vitest";
import { analyzeDesign } from "@/lib/analyzer/design";
import { ctxFrom, detailOf, shell, statusOf } from "./helpers";

describe("dark mode detection", () => {
  /*
   * Every one of these is a real mechanism found on a live portfolio. The original
   * check only recognised the first two and reported the rest as "no dark mode",
   * which is the bug these cases exist to prevent coming back.
   */
  it("recognises a prefers-color-scheme media query", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), "@media (prefers-color-scheme: dark){body{background:#000}}");
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("recognises a data-theme attribute", () => {
    const ctx = ctxFrom('<!doctype html><html lang="en" data-theme="dark"><body><h1>Ada</h1></body></html>');
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("recognises a .dark class block re-pointing tokens (Tailwind / next-themes)", () => {
    // The exact shape served by the reporter's own portfolio.
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), ":root{--background:#fff}.dark{--background:#060a14;--foreground:#e6edf6}");
    const report = analyzeDesign(ctx);
    expect(statusOf(report.checks, "design-dark-mode")).toBe("pass");
    expect(detailOf(report.checks, "design-dark-mode")).toMatch(/class/i);
  });

  it("recognises a .dark class in minified CSS with no leading whitespace", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), "body{color:#111}.dark{--bg:#000}");
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("recognises Tailwind's escaped dark variant utilities", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), ".dark\\:bg-black:where(.dark,.dark *){background:#000}");
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("recognises a data-color-mode attribute (non-standard spelling)", () => {
    const ctx = ctxFrom('<!doctype html><html lang="en" data-color-mode="light"><body><h1>Ada</h1></body></html>');
    const report = analyzeDesign(ctx);
    expect(statusOf(report.checks, "design-dark-mode")).toBe("pass");
    expect(detailOf(report.checks, "design-dark-mode")).toContain("data-color-mode");
  });

  it("recognises a visible theme toggle control", () => {
    const ctx = ctxFrom(shell('<h1>Ada</h1><button aria-label="Toggle color theme">◐</button>'));
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("recognises a theme script reading the OS preference", () => {
    const ctx = ctxFrom(
      shell("<h1>Ada</h1>", "<script>window.matchMedia('(prefers-color-scheme: dark)')</script>"),
    );
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("pass");
  });

  it("still warns when there is genuinely no dark mode", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), "body{background:#fff;color:#111}");
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("warn");
  });

  it("does not mistake .darkred or .dark-blue for a theme", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1>"), ".darkred{color:#a00}.dark-blue{color:#004}");
    expect(statusOf(analyzeDesign(ctx).checks, "design-dark-mode")).toBe("warn");
  });
});

describe("inline style check", () => {
  it("ignores animation-only inline styles from motion libraries", () => {
    // Framer Motion writes opacity/transform on every animated element.
    const animated = Array.from(
      { length: 40 },
      () => '<div style="opacity:0;transform:translateY(24px)">x</div>',
    ).join("");
    const ctx = ctxFrom(shell(`<h1>Ada</h1>${animated}`));
    const report = analyzeDesign(ctx);
    expect(statusOf(report.checks, "design-inline-styles")).toBe("pass");
    expect(detailOf(report.checks, "design-inline-styles")).toMatch(/animation-only/);
  });

  it("ignores inline custom properties", () => {
    const styled = Array.from({ length: 30 }, () => '<div style="--pb-bg:var(--x)">x</div>').join("");
    const ctx = ctxFrom(shell(`<h1>Ada</h1>${styled}`));
    expect(statusOf(analyzeDesign(ctx).checks, "design-inline-styles")).toBe("pass");
  });

  it("still flags real inline design declarations", () => {
    const styled = Array.from(
      { length: 45 },
      () => '<div style="color:#f00;font-size:19px;margin-left:7px">x</div>',
    ).join("");
    const ctx = ctxFrom(shell(`<h1>Ada</h1>${styled}`));
    expect(statusOf(analyzeDesign(ctx).checks, "design-inline-styles")).toBe("fail");
  });
});

describe("typeface detection", () => {
  it("does not report var() fallback lists as chosen typefaces", () => {
    const ctx = ctxFrom(
      shell("<h1>Ada</h1>"),
      'body{font-family:var(--font-sans, ui-sans-serif, "Noto Color Emoji")}',
    );
    expect(analyzeDesign(ctx).fonts).toEqual([]);
  });

  it("ignores !important and framework fallback twins", () => {
    const ctx = ctxFrom(
      shell("<h1>Ada</h1>"),
      "body{font-family:__Inter_a1b2c3, __Inter_Fallback_a1b2c3, sans-serif!important}",
    );
    expect(analyzeDesign(ctx).fonts).toEqual(["Inter"]);
  });

  it("skips platform faces at the head of a system stack", () => {
    const ctx = ctxFrom(
      shell("<h1>Ada</h1>"),
      'body{font-family:"Segoe UI", Roboto, sans-serif}code{font-family:SFMono-Regular, Menlo, monospace}',
    );
    // Roboto is a real choice; Segoe UI and SFMono-Regular are stack furniture.
    expect(analyzeDesign(ctx).fonts).toEqual(["Roboto"]);
  });
});

describe("heading and metadata checks", () => {
  it("passes a single h1 and flags none", () => {
    expect(statusOf(analyzeDesign(ctxFrom(shell("<h1>Ada</h1>"))).checks, "design-h1")).toBe("pass");
    expect(statusOf(analyzeDesign(ctxFrom(shell("<h2>Ada</h2>"))).checks, "design-h1")).toBe("fail");
  });

  it("flags a skipped heading level", () => {
    const ctx = ctxFrom(shell("<h1>Ada</h1><h4>Projects</h4><h2>About</h2>"));
    expect(statusOf(analyzeDesign(ctx).checks, "design-heading-order")).not.toBe("pass");
  });

  it("counts a decorative alt=\"\" as present", () => {
    const ctx = ctxFrom(shell('<h1>Ada</h1><img src="/a.png" alt=""><img src="/b.png" alt="Chart">'));
    const report = analyzeDesign(ctx);
    expect(report.imagesMissingAlt).toBe(0);
    expect(statusOf(report.checks, "design-alt-text")).toBe("pass");
  });

  it("flags a viewport that blocks pinch zoom", () => {
    const ctx = ctxFrom(
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, user-scalable=no"><title>T</title></head><body><h1>A</h1></body></html>',
    );
    expect(statusOf(analyzeDesign(ctx).checks, "design-zoom")).toBe("fail");
  });
});
