import type {
  Check,
  DeliverabilityReport,
  DocumentWork,
  DocumentWorkReport,
  PresentationReport,
} from "@/lib/types";
import type { ExtractedDocument, ExtractedPage } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";
import { probeLink } from "@/lib/fetcher";
import { mapLimit } from "@/lib/analyzer/concurrency";
import { looksLikeHeading } from "./sections";

/**
 * The uploaded portfolio document — a PDF deck, an exported case-study set, a lookbook.
 *
 * This is what a designer, photographer, architect, or copywriter actually sends, and
 * it fails in ways a website never does. It is too heavy for an employer's mail server.
 * Its links are printed rather than clickable. It is forty pages when the reviewer will
 * open six. Those are the checks here, alongside the one that matters most: whether each
 * piece explains anything, or whether the document is a gallery with no captions.
 */

/** Boilerplate that would otherwise be picked up as a piece of work. */
const NOT_A_WORK_TITLE =
  /^(contents?|table of contents|index|about( me)?|contact|thank ?you|introduction|intro|cover|curriculum|resume|\bcv\b|references|appendix|page \d+|\d+)$/i;

const WORK_HEADING =
  /^(project|case stud|client|campaign|series|collection|study|brief|work)\b/i;

/**
 * Pieces of work in the document.
 *
 * Page-per-piece is the dominant layout, so a heading near the top of a page is the
 * strongest available signal. Explicit "Case Study 3" style headings are trusted
 * anywhere on the page; everything else has to be in the first few lines to count,
 * which keeps captions and footnotes out.
 */
export function findWorks(
  document: ExtractedDocument,
  profile: DisciplineProfile,
): DocumentWork[] {
  const works: DocumentWork[] = [];

  for (const page of document.pages) {
    const candidate = page.lines
      .slice(0, 4)
      .find((line) => looksLikeHeading(line) && !NOT_A_WORK_TITLE.test(line));
    const explicit = page.lines.find((line) => WORK_HEADING.test(line));
    const title = explicit ?? candidate;
    if (!title) continue;

    const outcomeTerms = profile.outcomeTerms.filter((term) =>
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(page.text),
    );

    const issues: string[] = [];
    if (page.wordCount < 25) issues.push("almost no explanation on the page");
    if (page.imageCount === 0 && page.wordCount < 120) issues.push("neither imagery nor detail");
    if (outcomeTerms.length === 0) issues.push("no outcome stated");

    works.push({
      title: title.slice(0, 120),
      page: page.number,
      wordCount: page.wordCount,
      imageCount: page.imageCount,
      outcomeTerms,
      issues,
    });
  }

  return works;
}

export function analyzeDocumentWork(
  document: ExtractedDocument,
  profile: DisciplineProfile,
): DocumentWorkReport {
  const works = findWorks(document, profile);
  const noun = profile.workNoun;

  const averageWords =
    works.length > 0
      ? Math.round(works.reduce((sum, work) => sum + work.wordCount, 0) / works.length)
      : 0;
  const withOutcome = works.filter((work) => work.outcomeTerms.length > 0).length;
  const thin = works.filter((work) => work.wordCount < 25).length;

  const checks: Check[] = [
    {
      id: "work-count",
      label: `${noun.plural[0].toUpperCase()}${noun.plural.slice(1)} shown`,
      status: works.length >= 3 ? "pass" : works.length >= 1 ? "warn" : "fail",
      detail:
        works.length === 0
          ? `No distinct ${noun.plural} could be identified. If each ${noun.singular} is a titled page, the titles are not coming through as text — which means they are images, and unsearchable.`
          : `${works.length} ${works.length === 1 ? noun.singular : noun.plural} identified: ${works
              .slice(0, 5)
              .map((work) => `${work.title} (p${work.page})`)
              .join(", ")}${works.length > 5 ? "…" : "."}`,
    },
    {
      id: "work-depth",
      label: "Each piece is explained",
      status: averageWords >= 90 ? "pass" : averageWords >= 35 ? "warn" : "fail",
      detail:
        works.length === 0
          ? "Nothing to measure."
          : `Average of ${averageWords} words per ${noun.singular}${
              thin > 0 ? `, and ${thin} with almost nothing at all` : ""
            }. A reviewer in this field wants ${profile.depthExpectations.join("; ")}.`,
    },
    {
      id: "work-outcomes",
      label: "Outcomes stated",
      status:
        works.length === 0
          ? "fail"
          : withOutcome >= Math.ceil(works.length * 0.5)
            ? "pass"
            : withOutcome > 0
              ? "warn"
              : "fail",
      detail:
        works.length === 0
          ? "Nothing to measure."
          : `${withOutcome} of ${works.length} ${noun.plural} say what came of the work. Finished visuals show what you made; the outcome is what says it worked.`,
    },
  ];

  return {
    score: scoreFromChecks(checks, {
      "work-count": 3,
      "work-depth": 2.5,
      "work-outcomes": 2,
    }),
    count: works.length,
    works,
    averageWords,
    withOutcome,
    checks,
  };
}

/* ------------------------------- presentation --------------------------------- */

function orientationOf(pages: ExtractedPage[]): "portrait" | "landscape" | "mixed" {
  const shapes = new Set(
    pages
      .filter((page) => page.width !== null && page.height !== null)
      .map((page) => ((page.width as number) >= (page.height as number) ? "landscape" : "portrait")),
  );
  if (shapes.size === 0) return "portrait";
  if (shapes.size > 1) return "mixed";
  return [...shapes][0] as "portrait" | "landscape";
}

export function analyzePresentation(document: ExtractedDocument): PresentationReport {
  const pages = document.pages;
  const pageCount = document.pageCount;

  const emptyPages = pages.filter((page) => page.wordCount < 5 && page.imageCount === 0).length;
  const imagesPerPage = pages.length > 0 ? document.imageCount / pages.length : 0;
  const wordsPerPage = pages.length > 0 ? Math.round(document.wordCount / pages.length) : 0;

  const sizes = new Set(
    pages
      .filter((page) => page.width !== null)
      .map((page) => `${Math.round(page.width as number)}x${Math.round(page.height as number)}`),
  );
  const consistentPageSize = sizes.size <= 1;
  const orientation = orientationOf(pages);

  const checks: Check[] = [];

  if (pageCount !== null) {
    checks.push({
      id: "presentation-length",
      label: "Length a reviewer will finish",
      status: pageCount <= 20 ? "pass" : pageCount <= 40 ? "warn" : "fail",
      detail:
        pageCount <= 20
          ? `${pageCount} pages — a reviewer will get to the end.`
          : `${pageCount} pages. Portfolio review happens in minutes, not sittings; the work past about page 20 is rarely seen. Lead with your six strongest pieces and keep the rest for interviews.`,
    });
  }

  checks.push(
    {
      id: "presentation-empty",
      label: "No empty pages",
      status: emptyPages === 0 ? "pass" : emptyPages <= 2 ? "warn" : "fail",
      detail:
        emptyPages === 0
          ? "Every page carries either content or imagery."
          : `${emptyPages} page${emptyPages === 1 ? "" : "s"} contain neither readable text nor an image. Either they are blank, or their content is flattened into something the file does not expose as either.`,
    },
    {
      id: "presentation-consistent",
      label: "Consistent page size",
      status: consistentPageSize ? "pass" : "warn",
      detail: consistentPageSize
        ? "All pages share one size."
        : `${sizes.size} different page sizes in one document. It reads as pages assembled from separate exports rather than one considered piece.`,
    },
    {
      id: "presentation-orientation",
      label: "Consistent orientation",
      status: orientation === "mixed" ? "warn" : "pass",
      detail:
        orientation === "mixed"
          ? "Pages mix portrait and landscape, so the reader has to rotate the document part-way through."
          : `Consistently ${orientation}${orientation === "landscape" ? ", which suits on-screen review" : ""}.`,
    },
  );

  return {
    score: scoreFromChecks(checks, {
      "presentation-length": 2,
      "presentation-empty": 1.5,
      "presentation-consistent": 1,
      "presentation-orientation": 0.75,
    }),
    pageCount,
    emptyPages,
    imagesPerPage: Math.round(imagesPerPage * 10) / 10,
    wordsPerPage,
    consistentPageSize,
    orientation,
    checks,
  };
}

/* ------------------------------ deliverability -------------------------------- */

/** Most employer mail servers reject attachments above this. */
const EMAIL_ATTACHMENT_LIMIT = 10 * 1024 * 1024;

export async function analyzeDeliverability(
  document: ExtractedDocument,
  options: { checkLinks: boolean; maxLinkChecks: number },
): Promise<DeliverabilityReport> {
  const emailable = document.bytes <= EMAIL_ATTACHMENT_LIMIT;
  const megabytes = (document.bytes / 1024 / 1024).toFixed(1);

  const links = document.links.slice(0, 60).map((url) => ({
    url,
    text: "",
    kind: "external" as const,
    platform: null,
    checked: false,
    status: null as number | null,
    ok: null as boolean | null,
    blocked: false,
    error: null as string | null,
    redirectedTo: null as string | null,
  }));

  if (options.checkLinks) {
    await mapLimit(links.slice(0, options.maxLinkChecks), 6, async (link) => {
      const probe = await probeLink(link.url);
      link.checked = true;
      link.status = probe.status;
      link.ok = probe.ok;
      link.blocked = probe.blocked;
      link.error = probe.error;
      link.redirectedTo = probe.redirectedTo;
    });
  }

  const broken = links.filter((link) => link.checked && link.ok === false);
  const unverified = links.filter((link) => link.checked && link.blocked);

  const checks: Check[] = [
    {
      id: "delivery-size",
      label: "Small enough to email",
      status: emailable ? "pass" : "fail",
      detail: emailable
        ? `${megabytes} MB — under the 10 MB most employer mail servers accept.`
        : `${megabytes} MB. Most corporate mail servers reject attachments over 10 MB, so this may be bouncing without you being told. Export at a lower image quality, or send a link instead.`,
    },
    {
      id: "delivery-links",
      label: "Links are clickable",
      status: document.links.length === 0 ? "warn" : document.hasClickableLinks ? "pass" : "warn",
      detail:
        document.links.length === 0
          ? "No links found. A portfolio document should point somewhere — a site, a live piece, a profile."
          : document.hasClickableLinks
            ? `${document.links.length} link${document.links.length === 1 ? "" : "s"}, clickable in a viewer.`
            : `${document.links.length} URL${document.links.length === 1 ? " is" : "s are"} printed as text but are not real links. On screen, a reviewer has to retype them.`,
    },
  ];

  if (options.checkLinks && links.some((link) => link.checked)) {
    checks.push({
      id: "delivery-broken",
      label: "Links still work",
      status: broken.length === 0 ? "pass" : broken.length <= 2 ? "warn" : "fail",
      detail:
        broken.length === 0
          ? `All ${links.filter((link) => link.checked).length} checked links responded.`
          : `${broken.length} dead link${broken.length === 1 ? "" : "s"}: ${broken
              .slice(0, 3)
              .map((link) => link.url)
              .join(", ")}. A document circulates for years — these were probably fine when you exported it.`,
    });
  }

  return {
    score: scoreFromChecks(checks, {
      "delivery-size": 2.5,
      "delivery-links": 1.5,
      "delivery-broken": 2,
    }),
    bytes: document.bytes,
    emailable,
    hasClickableLinks: document.hasClickableLinks,
    linkCount: document.links.length,
    brokenCount: broken.length,
    unverifiedCount: unverified.length,
    links,
    checks,
  };
}
