/**
 * CSS colour parsing and custom-property resolution.
 *
 * Split out of the design review because the contrast check was silently skipping most
 * modern portfolios: it only understood literal hex and `rgb()` written directly on
 * `body`, while token-based designs write `color: var(--foreground)` and define the token
 * elsewhere — increasingly in `hsl()` or `oklch()` rather than hex. A check that quietly
 * does not run is worse than one that fails loudly, so this module resolves the token
 * indirection and the two modern colour spaces.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED_COLORS: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  red: { r: 255, g: 0, b: 0 },
  transparent: { r: 255, g: 255, b: 255 },
};

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = ((h % 360) + 360) % 360;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r1, g1, b1] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = lightness - chroma / 2;
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255) };
}

/** OKLCH → sRGB, via OKLab and linear sRGB. Tailwind 4 and shadcn/ui emit oklch(). */
function oklchToRgb(lightness: number, chroma: number, hueDeg: number): Rgb {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const gamma = (channel: number) =>
    channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

  return {
    r: clamp255(gamma(linear[0]) * 255),
    g: clamp255(gamma(linear[1]) * 255),
    b: clamp255(gamma(linear[2]) * 255),
  };
}

function numeric(token: string, scaleIfPercent = 1): number {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) return (Number.parseFloat(trimmed) / 100) * scaleIfPercent;
  return Number.parseFloat(trimmed);
}

/** Parse a literal colour value. Returns null for anything unresolvable. */
export function parseColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase().replace(/!important$/, "").trim();
  if (!value) return null;

  if (NAMED_COLORS[value]) return NAMED_COLORS[value];

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
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  /*
   * Greedy inner capture, not `[^)]+`: Tailwind writes the alpha channel as a nested
   * function — `rgb(15 23 42/var(--tw-bg-opacity))` — and a non-nesting pattern failed to
   * match it at all, which is why contrast came back unknown on utility-first sites.
   */
  const rgb = /^rgba?\(\s*([\s\S]*)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split("/")[0].trim().split(/[\s,]+/);
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((part) => numeric(part, 255));
    if (channels.some((channel) => Number.isNaN(channel))) return null;
    return { r: clamp255(channels[0]), g: clamp255(channels[1]), b: clamp255(channels[2]) };
  }

  // hsl(222deg 22% 5%) and hsl(222, 22%, 5%)
  const hsl = /^hsla?\(\s*([\s\S]*)\)$/.exec(value);
  if (hsl) {
    const parts = hsl[1].split("/")[0].trim().split(/[\s,]+/);
    if (parts.length < 3) return null;
    const hue = Number.parseFloat(parts[0].replace(/deg|turn|rad/g, ""));
    const saturation = Number.parseFloat(parts[1]);
    const lightness = Number.parseFloat(parts[2]);
    if ([hue, saturation, lightness].some((n) => Number.isNaN(n))) return null;
    return hslToRgb(hue, saturation, lightness);
  }

  // oklch(0.62 0.2 250) and oklch(62% 0.2 250deg)
  const oklch = /^oklch\(\s*([\s\S]*)\)$/.exec(value);
  if (oklch) {
    const parts = oklch[1].split("/")[0].trim().split(/[\s,]+/);
    if (parts.length < 3) return null;
    const lightness = numeric(parts[0], 1);
    const chroma = numeric(parts[1], 0.4);
    const hue = Number.parseFloat(parts[2].replace(/deg/g, ""));
    if ([lightness, chroma, hue].some((n) => Number.isNaN(n))) return null;
    return oklchToRgb(lightness, chroma, hue);
  }

  return null;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/* ------------------------------ stylesheet model ----------------------------- */

export interface CssBlock {
  selector: string;
  declarations: string;
}

/**
 * Declaration blocks, innermost only, so at-rule preludes never leak into a selector.
 * `[^{}]+` cannot cross a brace, so `@media x{body{…}}` yields the selector "body".
 */
export function parseBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.push({ selector: match[1].trim(), declarations: match[2] });
  }
  return blocks;
}

/**
 * Split a stylesheet into its default rules and its dark-theme rules.
 *
 * Needed because the two themes define the same token names. Merging them would measure
 * a dark foreground against a light background — a number belonging to neither theme.
 * Handles both idioms: a `prefers-color-scheme: dark` media block, and a `.dark` /
 * `[data-theme="dark"]` selector.
 */
export function splitThemes(css: string): { light: string; dark: string } {
  let light = "";
  let dark = "";
  let index = 0;

  while (index < css.length) {
    const at = css.indexOf("@media", index);
    if (at === -1) {
      light += css.slice(index);
      break;
    }

    light += css.slice(index, at);

    const open = css.indexOf("{", at);
    if (open === -1) {
      light += css.slice(at);
      break;
    }

    // Brace-match to the end of the at-rule body.
    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    }

    const prelude = css.slice(at, open);
    const body = css.slice(open + 1, Math.max(open + 1, cursor - 1));
    if (/prefers-color-scheme\s*:\s*dark/i.test(prelude)) dark += body;
    else light += body;

    index = cursor;
  }

  // Class and attribute themes live in the default cascade; move them across.
  const isDarkSelector = (selector: string) =>
    /\.dark(?![\w-])|\[data-[\w-]*(theme|mode|scheme)[^\]]*=\s*["']?dark/i.test(selector);

  let lightRemainder = "";
  for (const block of parseBlocks(light)) {
    const rule = `${block.selector}{${block.declarations}}`;
    if (isDarkSelector(block.selector)) dark += rule;
    else lightRemainder += rule;
  }

  return { light: lightRemainder, dark };
}

/**
 * Where token declarations live. Not just `:root` — a dark theme declares the same token
 * names under its own scope (`.dark`, `[data-theme="dark"]`, `html.dark`), and restricting
 * this to root selectors meant the dark values were never collected at all.
 */
const SCOPE_SELECTOR =
  /(^|,)\s*(:root|html|body|\*)|\.dark(?![\w-])|\.light(?![\w-])|\[data-[\w-]*(theme|mode|scheme)/i;

/** A selector whose subject is the document body, allowing a theme scope in front. */
const BODY_SELECTOR = /(^|,|\s)(:root|html|body|\*)(\.[\w-]+|\[[^\]]*\]|:[\w-]+)*\s*(,|$)/i;

/** Custom properties declared on a root or theme scope, later declarations winning. */
export function collectCustomProperties(css: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const block of parseBlocks(css)) {
    if (!SCOPE_SELECTOR.test(block.selector)) continue;
    for (const match of block.declarations.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      properties.set(match[1].trim(), match[2].trim());
    }
  }
  return properties;
}

/**
 * Resolve a declaration value to a colour, following `var()` indirection (including
 * fallbacks) up to a small depth so a token cycle cannot hang the analysis.
 */
export function resolveColor(
  raw: string,
  properties: Map<string, string>,
  depth = 0,
): Rgb | null {
  if (depth > 4) return null;
  const value = raw.trim();

  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(value);
  if (varMatch) {
    const referenced = properties.get(varMatch[1]);
    if (referenced !== undefined) {
      const resolved = resolveColor(referenced, properties, depth + 1);
      if (resolved) return resolved;
    }
    return varMatch[2] ? resolveColor(varMatch[2], properties, depth + 1) : null;
  }

  // `background: var(--bg) no-repeat` / `background: #fff url(x)` — take the first token.
  const direct = parseColor(value);
  if (direct) return direct;

  const firstToken = value.split(/\s+(?![^(]*\))/)[0];
  return firstToken && firstToken !== value ? resolveColor(firstToken, properties, depth + 1) : null;
}

/**
 * Distinct colours declared as custom properties, across every theme.
 *
 * This is the meaningful measure of palette discipline. Counting every literal colour in
 * the compiled CSS conflates a design system with incidental values — a syntax-highlight
 * theme alone contributes dozens — and flagged sites with excellent, deliberate palettes.
 */
export function collectColorTokens(css: string): Set<string> {
  const { light, dark } = splitThemes(css);
  const colors = new Set<string>();

  for (const source of [light, dark]) {
    const properties = collectCustomProperties(source);
    for (const [, value] of properties) {
      const resolved = resolveColor(value, properties);
      if (resolved) colors.add(toHex(resolved));
    }
  }

  return colors;
}

export interface ThemeContrast {
  theme: "default" | "dark";
  ratio: number;
  foreground: string;
  background: string;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Colour and background contributed by utility classes on the document root.
 *
 * Utility-first sites never write a `body { color: … }` rule — the colours ride on
 * classes like `bg-slate-900 text-slate-400`, so the contrast check found nothing to
 * measure on the single most common portfolio stack. Source order decides between
 * equal-specificity class rules, so the last declaration wins.
 */
function colorFromClasses(
  css: string,
  classes: string[],
): { color: string | null; background: string | null } {
  if (classes.length === 0) return { color: null, background: null };

  const wanted = new Set(classes);
  let color: string | null = null;
  let background: string | null = null;

  for (const block of parseBlocks(css)) {
    // A single class selector, possibly escaped (`.text-slate-400`, `.dark\:bg-black`).
    const match = /^\.((?:[\w-]|\\.)+)$/.exec(block.selector.trim());
    if (!match) continue;
    const className = match[1].replace(/\\(.)/g, "$1");
    if (!wanted.has(className)) continue;

    const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(block.declarations);
    const backgroundMatch = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(
      block.declarations,
    );
    if (colorMatch) color = colorMatch[1];
    if (backgroundMatch) background = backgroundMatch[1];
  }

  return { color, background };
}

/**
 * Body text contrast for whichever themes the stylesheet actually defines.
 *
 * `rootClasses` are the classes on <html> and <body>, used when no root rule states the
 * colours directly.
 */
export function measureThemeContrast(css: string, rootClasses: string[] = []): ThemeContrast[] {
  const { light, dark } = splitThemes(css);
  const lightProperties = collectCustomProperties(light);
  const darkTokens = collectCustomProperties(dark);
  // The dark theme inherits every token it does not re-point.
  const darkProperties = new Map([...lightProperties, ...darkTokens]);

  /** Last body/html/:root colour + background declarations in the given CSS. */
  const findPair = (source: string) => {
    let color: string | null = null;
    let background: string | null = null;
    for (const block of parseBlocks(source)) {
      if (!BODY_SELECTOR.test(block.selector)) continue;
      const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(block.declarations);
      const backgroundMatch = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(
        block.declarations,
      );
      if (colorMatch) color = colorMatch[1];
      if (backgroundMatch) background = backgroundMatch[1];
    }
    return { color, background };
  };

  const declared = findPair(light);
  const fromClasses = colorFromClasses(light, rootClasses);
  // A root rule is the stronger signal; classes fill in what it does not state.
  const base = {
    color: declared.color ?? fromClasses.color,
    background: declared.background ?? fromClasses.background,
  };
  const results: ThemeContrast[] = [];

  const evaluate = (
    theme: "default" | "dark",
    colorRaw: string | null,
    backgroundRaw: string | null,
    properties: Map<string, string>,
  ) => {
    if (!colorRaw || !backgroundRaw) return;
    const foreground = resolveColor(colorRaw, properties);
    const background = resolveColor(backgroundRaw, properties);
    if (!foreground || !background) return;
    results.push({
      theme,
      ratio: contrastRatio(foreground, background),
      foreground: toHex(foreground),
      background: toHex(background),
    });
  };

  evaluate("default", base.color, base.background, lightProperties);

  /*
   * The dark theme usually only re-points tokens and reuses the light theme's body rule,
   * so its presence is detected from the token declarations — not from map size, which is
   * identical when both themes define the same names.
   */
  const darkPair = findPair(dark);
  if (darkTokens.size > 0 || darkPair.color || darkPair.background) {
    evaluate(
      "dark",
      darkPair.color ?? base.color,
      darkPair.background ?? base.background,
      darkProperties,
    );
  }

  return results;
}
