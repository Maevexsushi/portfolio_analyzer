import type { PageContext } from "./context";
import { collapse, selectorHints } from "./context";
import type { SectionFinding, SectionsReport } from "@/lib/types";

/**
 * Portfolio Sections Checker.
 *
 * A section counts as present when we find it in any of four places: a heading, a
 * section/div identifier, a nav link, or an in-page anchor target. Any one of those
 * is decent evidence; requiring all four would fail most real portfolios.
 */

interface SectionDefinition {
  id: string;
  label: string;
  required: boolean;
  /** Matched against heading text and nav link text. */
  keywords: string[];
  /** Matched against id/class/aria-label attributes and anchor hrefs. */
  slugs: string[];
  /** Structural fallback when no text or attribute matched. */
  detect?: (ctx: PageContext) => string | null;
}

const DEFINITIONS: SectionDefinition[] = [
  {
    id: "hero",
    label: "Hero / Intro",
    required: true,
    keywords: ["hi i'm", "hi, i'm", "hello i'm", "i am a", "welcome"],
    slugs: ["hero", "intro", "banner", "masthead", "landing", "home"],
    detect: (ctx) => {
      const h1 = ctx.$("h1").first();
      const text = collapse(h1.text());
      return text ? `<h1> "${text.slice(0, 60)}"` : null;
    },
  },
  {
    id: "about",
    label: "About / Bio",
    required: true,
    keywords: ["about me", "about", "bio", "who i am", "profile", "summary"],
    slugs: ["about", "bio", "profile", "summary"],
  },
  {
    id: "projects",
    label: "Projects / Work",
    required: true,
    keywords: [
      "projects",
      "my work",
      "portfolio",
      "case studies",
      "selected work",
      "recent work",
      "featured",
      // Portfolios very often avoid the word "projects" entirely.
      "things i've built",
      "things i've made",
      "things i built",
      "what i've built",
      "what i've made",
      "working on",
      "side projects",
      "builds",
      "experiments",
    ],
    slugs: ["project", "work", "portfolio", "case-stud", "casestud", "showcase"],
  },
  {
    id: "skills",
    label: "Skills / Tech Stack",
    required: true,
    keywords: [
      "skills",
      "tech stack",
      "technologies",
      "toolkit",
      "what i use",
      "expertise",
      "competencies",
    ],
    slugs: ["skill", "stack", "tech", "technolog", "tool", "expertise"],
  },
  {
    id: "experience",
    label: "Experience",
    required: true,
    keywords: [
      "experience",
      "work experience",
      "employment",
      "career",
      "where i've worked",
      "history",
    ],
    slugs: ["experience", "employment", "career", "job", "work-history", "timeline"],
  },
  {
    id: "contact",
    label: "Contact",
    required: true,
    keywords: ["contact", "get in touch", "reach out", "hire me", "let's talk", "say hello"],
    slugs: ["contact", "get-in-touch", "hire", "connect"],
    detect: (ctx) => {
      if (ctx.$('a[href^="mailto:"]').length > 0) return "mailto: link present";
      // Webmail compose links serve the same purpose as mailto: and are common.
      const compose = ctx
        .$("a[href]")
        .toArray()
        .find((el) =>
          /mail\.google\.com\/mail|outlook\.(live|office)\.com|mail\.yahoo\.com|mail\.proton\.me/i.test(
            ctx.$(el).attr("href") ?? "",
          ),
        );
      if (compose) return "webmail compose link present";
      return ctx.$('form input[type="email"]').length > 0 ? "contact form present" : null;
    },
  },
  {
    id: "education",
    label: "Education",
    required: false,
    keywords: ["education", "degree", "university", "bachelor", "coursework", "bootcamp"],
    slugs: ["education", "school", "university", "academic"],
  },
  {
    id: "resume",
    label: "Resume / CV",
    required: false,
    keywords: ["resume", "cv", "download resume", "download cv"],
    slugs: ["resume", "cv"],
    detect: (ctx) => {
      const match = ctx
        .$("a[href]")
        .toArray()
        .find((el) => /resume|cv\b|curriculum/i.test(ctx.$(el).attr("href") ?? ""));
      return match ? `link to ${ctx.$(match).attr("href")}` : null;
    },
  },
  {
    id: "testimonials",
    label: "Testimonials",
    required: false,
    keywords: ["testimonials", "recommendations", "what people say", "references", "kind words"],
    slugs: ["testimonial", "recommendation", "review", "reference"],
  },
  {
    id: "blog",
    label: "Blog / Writing",
    required: false,
    keywords: ["blog", "writing", "articles", "posts", "notes"],
    slugs: ["blog", "writing", "article", "post"],
  },
  {
    id: "certifications",
    label: "Certifications / Awards",
    required: false,
    keywords: ["certifications", "certificates", "awards", "achievements", "honors"],
    slugs: ["certificat", "award", "achievement", "honor", "badge"],
  },
];

const SECTION_TAGS = "section, div, article, main, aside, header, footer, nav";

/**
 * Curly and straight apostrophes are used interchangeably in headings ("Where I've
 * Worked" vs "Where I’ve Worked"), and a keyword written one way missed the other.
 */
function normalizeQuotes(input: string): string {
  return input.replace(/[’‘‛`´]/g, "'");
}

function matchesKeyword(rawHaystack: string, keywords: string[]): string | null {
  const haystack = normalizeQuotes(rawHaystack);
  for (const keyword of keywords) {
    // Short keywords like "cv" need word boundaries or they match "cvs", "recv".
    const pattern =
      keyword.length <= 3
        ? new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i")
        : new RegExp(escapeRegExp(keyword), "i");
    if (pattern.test(haystack)) return keyword;
  }
  return null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function analyzeSections(ctx: PageContext): SectionsReport {
  const { $ } = ctx;

  // Precompute the three cheap haystacks so we do not re-walk the DOM per section.
  const headingTexts = ctx.headings.map((heading) => heading.text);
  const navTexts = $("nav a, header a, [role='navigation'] a")
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter(Boolean);
  const anchorTargets = $("a[href^='#']")
    .map((_, el) => ($(el).attr("href") ?? "").slice(1).toLowerCase())
    .get()
    .filter(Boolean);
  const containerHints = $(SECTION_TAGS)
    .toArray()
    .map((el) => selectorHints($, el))
    .filter((hint) => hint.trim().length > 0);

  const sections: SectionFinding[] = DEFINITIONS.map((definition) => {
    const evidence: string[] = [];

    const headingHit = headingTexts.find(
      (heading) => matchesKeyword(heading, definition.keywords) !== null,
    );
    if (headingHit) evidence.push(`heading "${headingHit}"`);

    const hintHit = containerHints.find((hint) =>
      definition.slugs.some((slug) => hint.includes(slug)),
    );
    if (hintHit) {
      const matched = definition.slugs.find((slug) => hintHit.includes(slug));
      evidence.push(`element marked "${matched}"`);
    }

    const navHit = navTexts.find(
      (nav) => matchesKeyword(nav, definition.keywords) !== null,
    );
    if (navHit) evidence.push(`nav link "${navHit}"`);

    const anchorHit = anchorTargets.find((target) =>
      definition.slugs.some((slug) => target.includes(slug)),
    );
    if (anchorHit) evidence.push(`anchor #${anchorHit}`);

    if (evidence.length === 0 && definition.detect) {
      const structural = definition.detect(ctx);
      if (structural) evidence.push(structural);
    }

    return {
      id: definition.id,
      label: definition.label,
      required: definition.required,
      found: evidence.length > 0,
      evidence: evidence.slice(0, 3),
    };
  });

  const required = sections.filter((section) => section.required);
  const bonus = sections.filter((section) => !section.required);
  const requiredFound = required.filter((section) => section.found).length;
  const bonusFound = bonus.filter((section) => section.found).length;

  // Required sections carry 85 points; bonus sections top up the remaining 15 so a
  // complete-but-plain portfolio can still reach a strong score.
  const requiredScore = (requiredFound / required.length) * 85;
  const bonusScore = Math.min(15, bonusFound * 4);

  return {
    score: Math.round(requiredScore + bonusScore),
    requiredFound,
    requiredTotal: required.length,
    bonusFound,
    sections,
  };
}
