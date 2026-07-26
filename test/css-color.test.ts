import { describe, expect, it } from "vitest";
import {
  collectCustomProperties,
  contrastRatio,
  measureThemeContrast,
  parseColor,
  resolveColor,
  splitThemes,
} from "@/lib/analyzer/css-color";

describe("colour parsing", () => {
  it("parses hex in 3, 6 and 8 digit forms", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#0d1424")).toEqual({ r: 13, g: 20, b: 36 });
    expect(parseColor("#0d1424ff")).toEqual({ r: 13, g: 20, b: 36 });
  });

  it("parses legacy and modern rgb syntax", () => {
    expect(parseColor("rgb(13, 20, 36)")).toEqual({ r: 13, g: 20, b: 36 });
    expect(parseColor("rgb(13 20 36 / 50%)")).toEqual({ r: 13, g: 20, b: 36 });
  });

  it("parses hsl, including deg units", () => {
    expect(parseColor("hsl(0 0% 100%)")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("hsl(0deg 0% 0%)")).toEqual({ r: 0, g: 0, b: 0 });
    // joshwcomeau.com's body text token.
    const ink = parseColor("hsl(222deg 22% 5%)");
    expect(ink).not.toBeNull();
    expect(ink!.r).toBeLessThan(30);
  });

  it("parses oklch, the Tailwind 4 / shadcn default", () => {
    const white = parseColor("oklch(1 0 0)");
    expect(white).toEqual({ r: 255, g: 255, b: 255 });

    const black = parseColor("oklch(0 0 0)");
    expect(black).toEqual({ r: 0, g: 0, b: 0 });

    // A mid blue should come back as recognisably blue.
    const blue = parseColor("oklch(0.55 0.2 262)");
    expect(blue).not.toBeNull();
    expect(blue!.b).toBeGreaterThan(blue!.r);
    expect(blue!.b).toBeGreaterThan(blue!.g);

    expect(parseColor("oklch(62% 0.2 250deg)")).not.toBeNull();
  });

  it("parses Tailwind's nested-function alpha channel", () => {
    // `rgb(15 23 42/var(--tw-bg-opacity))` — a non-nesting pattern matched none of this,
    // which is why contrast came back unknown on every utility-first site.
    expect(parseColor("rgb(15 23 42/var(--tw-bg-opacity))")).toEqual({ r: 15, g: 23, b: 42 });
    expect(parseColor("rgb(148 163 184/var(--tw-text-opacity, 1))")).toEqual({
      r: 148,
      g: 163,
      b: 184,
    });
  });

  it("returns null for values it cannot resolve", () => {
    expect(parseColor("color-mix(in oklab, red 50%, blue)")).toBeNull();
    expect(parseColor("inherit")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("utility-class colours", () => {
  // Tailwind v3 output, verbatim in shape, for a body carrying the two classes.
  const tailwind =
    ".bg-slate-900{--tw-bg-opacity:1;background-color:rgb(15 23 42/var(--tw-bg-opacity))}" +
    ".text-slate-400{--tw-text-opacity:1;color:rgb(148 163 184/var(--tw-text-opacity))}";

  it("measures contrast from classes on the document root", () => {
    const results = measureThemeContrast(tailwind, ["bg-slate-900", "text-slate-400"]);
    expect(results).toHaveLength(1);
    expect(results[0].ratio).toBeCloseTo(6.96, 1);
  });

  it("ignores classes the page does not actually use", () => {
    expect(measureThemeContrast(tailwind, ["bg-red-500"])).toEqual([]);
  });

  it("prefers a root rule over utility classes when both exist", () => {
    const css = `${tailwind}body{color:#000;background:#fff}`;
    const results = measureThemeContrast(css, ["bg-slate-900", "text-slate-400"]);
    expect(results[0].ratio).toBeCloseTo(21, 0);
  });
});

describe("contrast maths", () => {
  it("matches the known black-on-white ratio", () => {
    const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colours", () => {
    expect(contrastRatio({ r: 20, g: 20, b: 20 }, { r: 20, g: 20, b: 20 })).toBeCloseTo(1, 5);
  });
});

describe("custom property resolution", () => {
  const css = ":root{--ink:#101418;--paper:#ffffff;--alias:var(--ink)}";

  it("collects properties declared on the root", () => {
    const properties = collectCustomProperties(css);
    expect(properties.get("--ink")).toBe("#101418");
  });

  it("resolves a var() reference", () => {
    const properties = collectCustomProperties(css);
    expect(resolveColor("var(--ink)", properties)).toEqual({ r: 16, g: 20, b: 24 });
  });

  it("follows a chain of references", () => {
    const properties = collectCustomProperties(css);
    expect(resolveColor("var(--alias)", properties)).toEqual({ r: 16, g: 20, b: 24 });
  });

  it("falls back to the second argument when the token is undefined", () => {
    expect(resolveColor("var(--missing, #ff0000)", new Map())).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("takes the colour out of a shorthand background", () => {
    const properties = collectCustomProperties(css);
    expect(resolveColor("var(--paper) url(/hero.png) no-repeat", properties)).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });

  it("does not hang on a circular token", () => {
    const properties = collectCustomProperties(":root{--a:var(--b);--b:var(--a)}");
    expect(resolveColor("var(--a)", properties)).toBeNull();
  });
});

describe("theme splitting", () => {
  it("separates a prefers-color-scheme dark block", () => {
    const { light, dark } = splitThemes(
      ":root{--bg:#fff}@media (prefers-color-scheme: dark){:root{--bg:#000}}",
    );
    expect(collectCustomProperties(light).get("--bg")).toBe("#fff");
    expect(collectCustomProperties(dark).get("--bg")).toBe("#000");
  });

  it("separates a .dark class block", () => {
    const { light, dark } = splitThemes(":root{--bg:#fff}.dark{--bg:#060a14}");
    expect(collectCustomProperties(light).get("--bg")).toBe("#fff");
    expect(collectCustomProperties(dark).get("--bg")).toBe("#060a14");
  });

  it("separates a data-theme dark block", () => {
    const { dark } = splitThemes(':root{--bg:#fff}[data-theme="dark"]{--bg:#111}');
    expect(collectCustomProperties(dark).get("--bg")).toBe("#111");
  });

  it("keeps non-dark media queries in the default theme", () => {
    const { light } = splitThemes("@media (min-width:640px){body{color:#123456}}");
    expect(light).toContain("#123456");
  });
});

describe("measureThemeContrast", () => {
  it("resolves token-based body colours (the case it used to skip entirely)", () => {
    const css = ":root{--foreground:#101418;--background:#ffffff}body{color:var(--foreground);background:var(--background)}";
    const results = measureThemeContrast(css);
    expect(results).toHaveLength(1);
    expect(results[0].theme).toBe("default");
    expect(results[0].ratio).toBeGreaterThan(15);
  });

  it("measures each theme against its own tokens", () => {
    // The reporter's shape: one body rule, two token sets.
    const css =
      ":root{--foreground:#101418;--background:#ffffff}" +
      ".dark{--foreground:#e6edf6;--background:#060a14}" +
      "body{color:var(--foreground);background:var(--background)}";
    const results = measureThemeContrast(css);
    expect(results.map((r) => r.theme)).toEqual(["default", "dark"]);
    for (const result of results) expect(result.ratio).toBeGreaterThan(4.5);
  });

  it("catches a dark theme with poor contrast even when the light theme is fine", () => {
    const css =
      ":root{--fg:#111111;--bg:#ffffff}" +
      ".dark{--fg:#555555;--bg:#3a3a3a}" +
      "body{color:var(--fg);background:var(--bg)}";
    const results = measureThemeContrast(css);
    const worst = results.reduce((low, r) => (r.ratio < low.ratio ? r : low));
    expect(worst.theme).toBe("dark");
    expect(worst.ratio).toBeLessThan(3);
  });

  it("handles literal colours with no tokens at all", () => {
    const results = measureThemeContrast("body{color:#333;background:#fff}");
    expect(results[0].ratio).toBeGreaterThan(4.5);
  });

  it("returns nothing when the colours are unresolvable", () => {
    expect(measureThemeContrast("body{color:var(--x);background:var(--y)}")).toEqual([]);
  });
});
