import type { Check, DesignReport } from "@/lib/types";
import { scoreFromChecks } from "./check-utils";
import type { PageContext } from "./context";
import { collapse, wordCount } from "./context";

/**
 * Design Review.
 *
 * Static analysis cannot judge taste, so this checks the things that reliably read as
 * unpolished to a reviewer: no mobile viewport, broken heading hierarchy, missing alt
 * text, no metadata, an unbounded colour palette, too many typefaces. Where the CSS
 * gives us a real text/background pair we compute an actual WCAG contrast ratio.
 */

/**
 * Names that are not a design decision: CSS keywords, generic families, and the
 * platform fonts that head up the standard system stacks. Counting these as
 * typefaces would flag every site that uses a normal font stack.
 */
const GENERIC_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "inherit",
  "initial",
  "unset",
  "revert",
  "emoji",
  "math",
  "fangsong",
  // platform faces that appear at the head of system stacks
  "segoe ui",
  "segoe ui emoji",
  "segoe ui symbol",
  "apple color emoji",
  "noto color emoji",
  "helvetica",
  "helvetica neue",
  "arial",
  "sf mono",
  "sfmono-regular",
  "menlo",
  "monaco",
  "consolas",
  "cascadia code",
  "cascadia mono",
  "liberation mono",
  "courier new",
  "courier",
  "dejavu sans mono",
  "times new roman",
  "times",
]);

/**
 * Framework-generated family names. next/font emits `__Inter_a1b2c3` plus a
 * `__Inter_Fallback_a1b2c3` twin; both refer to one typeface the author chose once.
 */
function normalizeFontName(raw: string): string | null {
  if (!raw.startsWith("__")) return raw;
  if (/fallback/i.test(raw)) return null;
  const cleaned = raw.replace(/^__+/, "").replace(/_[0-9a-f]{4,}$/i, "").replace(/_/g, " ");
  return cleaned.trim() || null;
}

const VAGUE_LINK_TEXT = /^(click here|here|read more|more|link|this|learn more|see more)$/i;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (digits.length < 6) return null;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  if (value === "white") return { r: 255, g: 255, b: 255 };
  if (value === "black") return { r: 0, g: 0, b: 0 };
  return null;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Distinct colours ordered by how often the CSS mentions them. */
function extractPalette(css: string): string[] {
  const counts = new Map<string, number>();
  const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{5,60}\)/g;

  for (const match of css.match(pattern) ?? []) {
    const parsed = parseColor(match);
    if (!parsed) continue;
    const key = `#${[parsed.r, parsed.g, parsed.b]
      .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
      .join("")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
}

function extractFonts(ctx: PageContext): string[] {
  const families = new Set<string>();

  for (const match of ctx.css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const declaration = match[1];
    // `font-family: var(--font-sans, ui-sans-serif, "Noto Color Emoji")` cannot be
    // resolved without evaluating the custom property, and its fallback list would
    // otherwise be misread as the author's chosen faces.
    if (/var\(/i.test(declaration)) continue;

    for (const candidate of declaration.split(",")) {
      const raw = candidate
        .replace(/!\s*important/gi, "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim();
      const name = raw.toLowerCase();

      if (!name || name.startsWith("--") || /[()]/.test(name)) continue;
      // Walk past generic and platform names to the first real choice in the stack.
      if (GENERIC_FONTS.has(name)) continue;
      // Framework-generated metric-matched twins are not a second typeface.
      if (/fallback/i.test(name)) continue;

      const normalized = normalizeFontName(raw);
      if (!normalized) continue;
      families.add(normalized.toLowerCase());
      break;
    }
  }

  // Google Fonts / Adobe links declare families that may not appear in inline CSS.
  ctx.$("link[href*='fonts.googleapis.com'], link[href*='use.typekit.net']").each((_, el) => {
    const href = ctx.$(el).attr("href") ?? "";
    for (const match of href.matchAll(/family=([^&:]+)/g)) {
      const name = decodeURIComponent(match[1]).replace(/\+/g, " ").toLowerCase();
      if (name) families.add(name);
    }
  });

  return [...families].map((name) =>
    name.replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

/** Text/background pair declared for the page root, when the CSS states both. */
function findRootColorPair(css: string): { color: Rgb; background: Rgb } | null {
  const blocks = css.split("}");
  let color: Rgb | null = null;
  let background: Rgb | null = null;

  for (const block of blocks) {
    const [selectorPart, declarationPart] = block.split("{");
    if (!declarationPart) continue;
    if (!/(^|,)\s*(body|html|:root)\s*(,|$)/i.test(selectorPart)) continue;

    const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(declarationPart);
    const backgroundMatch =
      /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(declarationPart);

    if (colorMatch) color = parseColor(colorMatch[1]) ?? color;
    if (backgroundMatch) background = parseColor(backgroundMatch[1].split(" ")[0]) ?? background;
  }

  return color && background ? { color, background } : null;
}

export function analyzeDesign(ctx: PageContext): DesignReport {
  const { $ } = ctx;
  const checks: Check[] = [];

  /* responsiveness */
  const viewport = $("meta[name='viewport']").attr("content") ?? "";
  const responsive = /width\s*=\s*device-width/i.test(viewport);
  const zoomBlocked = /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport);
  const mediaQueries = (ctx.css.match(/@media[^{]*\(/g) ?? []).length;

  checks.push({
    id: "design-viewport",
    label: "Mobile viewport declared",
    status: responsive ? "pass" : "fail",
    detail: responsive
      ? `<meta name="viewport"> is set: ${viewport}`
      : "No responsive viewport meta tag — the page will render zoomed-out on phones.",
  });

  checks.push({
    id: "design-media-queries",
    label: "Responsive styles present",
    status: mediaQueries >= 3 ? "pass" : mediaQueries >= 1 ? "warn" : "fail",
    detail:
      mediaQueries === 0
        ? "No media queries found in the CSS we could read — layout may not adapt to small screens."
        : `${mediaQueries} media quer${mediaQueries === 1 ? "y" : "ies"} found.`,
  });

  if (zoomBlocked) {
    checks.push({
      id: "design-zoom",
      label: "Pinch zoom allowed",
      status: "fail",
      detail: "The viewport tag disables zooming, which fails WCAG 1.4.4.",
    });
  }

  /* heading structure */
  const h1Count = $("h1").length;
  checks.push({
    id: "design-h1",
    label: "Exactly one H1",
    status: h1Count === 1 ? "pass" : "fail",
    detail:
      h1Count === 0
        ? "No H1 on the page — it should carry your name or headline role."
        : h1Count === 1
          ? `H1: "${collapse($("h1").first().text()).slice(0, 80)}"`
          : `${h1Count} H1 elements found; keep one top-level heading.`,
  });

  let skips = 0;
  for (let index = 1; index < ctx.headings.length; index++) {
    if (ctx.headings[index].level - ctx.headings[index - 1].level > 1) skips += 1;
  }
  checks.push({
    id: "design-heading-order",
    label: "Heading levels in order",
    status: skips === 0 ? "pass" : skips <= 2 ? "warn" : "fail",
    detail:
      skips === 0
        ? `${ctx.headings.length} headings follow a logical order.`
        : `${skips} heading level jump${skips === 1 ? "" : "s"} (e.g. H2 straight to H4), which breaks screen-reader navigation.`,
  });

  /* images */
  const images = $("img");
  const imagesTotal = images.length;
  const imagesMissingAlt = images.filter((_, el) => $(el).attr("alt") === undefined).length;
  checks.push({
    id: "design-alt-text",
    label: "Images have alt text",
    status:
      imagesTotal === 0
        ? "warn"
        : imagesMissingAlt === 0
          ? "pass"
          : imagesMissingAlt / imagesTotal <= 0.25
            ? "warn"
            : "fail",
    detail:
      imagesTotal === 0
        ? "No <img> elements found — a portfolio usually needs visuals."
        : imagesMissingAlt === 0
          ? `All ${imagesTotal} images have an alt attribute.`
          : `${imagesMissingAlt} of ${imagesTotal} images are missing alt text.`,
  });

  /* semantics */
  const landmarks = ["header", "nav", "main", "section", "article", "footer"].filter(
    (tag) => $(tag).length > 0,
  );
  checks.push({
    id: "design-semantics",
    label: "Semantic landmarks",
    status: landmarks.length >= 4 ? "pass" : landmarks.length >= 2 ? "warn" : "fail",
    detail:
      landmarks.length === 0
        ? "The page is built entirely from <div>s — no semantic landmarks."
        : `Uses ${landmarks.map((tag) => `<${tag}>`).join(", ")}.`,
  });

  /* metadata */
  const title = ctx.meta.title;
  checks.push({
    id: "design-title",
    label: "Page title",
    status: title.length >= 15 && title.length <= 70 ? "pass" : title.length > 0 ? "warn" : "fail",
    detail:
      title.length === 0
        ? "No <title> — browser tabs and search results will show the bare URL."
        : `"${title}" (${title.length} characters${
            title.length < 15 ? ", too short — include your name and role" : title.length > 70 ? ", will be truncated in search results" : ""
          })`,
  });

  const description = ctx.meta.description;
  checks.push({
    id: "design-description",
    label: "Meta description",
    status:
      description.length >= 50 && description.length <= 165
        ? "pass"
        : description.length > 0
          ? "warn"
          : "fail",
    detail:
      description.length === 0
        ? "No meta description — you lose control of the search-result snippet."
        : `${description.length} characters${
            description.length < 50 ? " — aim for 50-160" : description.length > 165 ? " — will be cut off around 160" : ""
          }.`,
  });

  const hasOgTitle = $("meta[property='og:title']").length > 0;
  const hasOgImage = Boolean(ctx.meta.ogImage);
  checks.push({
    id: "design-social-preview",
    label: "Social share preview",
    status: hasOgTitle && hasOgImage ? "pass" : hasOgTitle || hasOgImage ? "warn" : "fail",
    detail:
      hasOgTitle && hasOgImage
        ? "Open Graph title and image are set, so shared links render a card."
        : "Missing Open Graph tags — links shared in Slack, LinkedIn, or DMs will look bare.",
  });

  checks.push({
    id: "design-favicon",
    label: "Favicon",
    status: ctx.meta.favicon ? "pass" : "warn",
    detail: ctx.meta.favicon ? `Declared: ${ctx.meta.favicon}` : "No favicon declared.",
  });

  checks.push({
    id: "design-lang",
    label: "Language declared",
    status: ctx.meta.lang ? "pass" : "warn",
    detail: ctx.meta.lang
      ? `<html lang="${ctx.meta.lang}">`
      : "No lang attribute on <html> — screen readers may use the wrong pronunciation.",
  });

  /* visual system */
  const palette = extractPalette(ctx.css);
  checks.push({
    id: "design-palette",
    label: "Colour palette is contained",
    status: palette.length === 0 ? "warn" : palette.length <= 24 ? "pass" : palette.length <= 48 ? "warn" : "fail",
    detail:
      palette.length === 0
        ? "No colours found in the CSS we could read (styles may be in a file we could not download)."
        : `${palette.length} distinct colours declared${
            palette.length > 24 ? " — a tighter palette reads as more deliberate" : "."
          }`,
  });

  const fonts = extractFonts(ctx);
  checks.push({
    id: "design-fonts",
    label: "Typeface count",
    status: fonts.length === 0 ? "warn" : fonts.length <= 3 ? "pass" : fonts.length <= 5 ? "warn" : "fail",
    detail:
      fonts.length === 0
        ? "No custom typefaces detected."
        : `${fonts.length} typeface${fonts.length === 1 ? "" : "s"}: ${fonts.slice(0, 6).join(", ")}${
            fonts.length > 3 ? " — two or three is usually plenty" : ""
          }`,
  });

  const darkModeAware = /prefers-color-scheme/i.test(ctx.css) || $("[data-theme]").length > 0;
  checks.push({
    id: "design-dark-mode",
    label: "Respects colour scheme preference",
    status: darkModeAware ? "pass" : "warn",
    detail: darkModeAware
      ? "Honours prefers-color-scheme."
      : "No dark-mode support. Optional, but it signals attention to detail.",
  });

  const colorPair = findRootColorPair(ctx.css);
  if (colorPair) {
    const ratio = contrastRatio(colorPair.color, colorPair.background);
    checks.push({
      id: "design-contrast",
      label: "Body text contrast",
      status: ratio >= 4.5 ? "pass" : ratio >= 3 ? "warn" : "fail",
      detail: `Body text contrast is ${ratio.toFixed(2)}:1 (WCAG AA needs 4.5:1 for normal text).`,
    });
  }

  /* content quality */
  const words = wordCount(ctx.text);
  checks.push({
    id: "design-content-depth",
    label: "Enough written content",
    status: words >= 300 ? "pass" : words >= 120 ? "warn" : "fail",
    detail: `${words} words of visible copy${
      words < 300 ? " — thin pages read as unfinished; describe your work in prose." : "."
    }`,
  });

  const vagueLinks = $("a")
    .toArray()
    .filter((el) => VAGUE_LINK_TEXT.test(collapse($(el).text()))).length;
  checks.push({
    id: "design-link-text",
    label: "Descriptive link text",
    status: vagueLinks === 0 ? "pass" : vagueLinks <= 2 ? "warn" : "fail",
    detail:
      vagueLinks === 0
        ? "Link labels describe their destination."
        : `${vagueLinks} link${vagueLinks === 1 ? "" : "s"} labelled "click here" / "read more" — say where they go.`,
  });

  const inlineStyled = $("[style]").length;
  checks.push({
    id: "design-inline-styles",
    label: "Styling kept in stylesheets",
    status: inlineStyled <= 10 ? "pass" : inlineStyled <= 40 ? "warn" : "fail",
    detail:
      inlineStyled <= 10
        ? "Little or no inline styling."
        : `${inlineStyled} elements carry inline style attributes, which usually means the design system drifted.`,
  });

  const score = scoreFromChecks(checks, {
    "design-viewport": 3,
    "design-media-queries": 2,
    "design-zoom": 1.5,
    "design-h1": 2,
    "design-heading-order": 1,
    "design-alt-text": 2,
    "design-semantics": 1.5,
    "design-title": 2,
    "design-description": 1.5,
    "design-social-preview": 1,
    "design-favicon": 0.5,
    "design-lang": 0.75,
    "design-palette": 1,
    "design-fonts": 1,
    "design-dark-mode": 0.5,
    "design-contrast": 2,
    "design-content-depth": 1.5,
    "design-link-text": 0.75,
    "design-inline-styles": 0.75,
  });

  return {
    score,
    checks,
    palette: palette.slice(0, 12),
    fonts,
    headings: ctx.headings.slice(0, 40),
    imagesTotal,
    imagesMissingAlt,
    responsive,
    darkModeAware,
    semanticLandmarks: landmarks,
  };
}
