import type { Element } from "domhandler";
import type { PageContext } from "./context";
import { collapse, resolveUrl, selectorHints, wordCount } from "./context";
import { detectSkillNames } from "./skills";
import type { Check, ProjectFinding, ProjectsReport } from "@/lib/types";

/**
 * Project Analyzer.
 *
 * Portfolios have no standard markup for a project, and utility-class frameworks mean
 * the class names usually say nothing ("mb-12", "flex flex-col"). So detection looks for
 * *structure* instead of names: a parent whose children repeat the same tag, where each
 * child is substantial enough to be a card. That finds `<ul><li>`, `<div><article>`, and
 * `<div><div>` grids alike.
 *
 * Repeated-sibling groups also appear in experience timelines and blog lists, so each
 * candidate group is scored against the nearest preceding heading and the links its
 * members contain, and the best-scoring group(s) win.
 */

const CONTAINER_SELECTOR = [
  "[id*='project' i]",
  "[class*='project' i]",
  "[id*='portfolio' i]",
  "[class*='portfolio' i]",
  "[id*='case' i]",
  "[class*='case' i]",
  "[id*='showcase' i]",
  "[class*='showcase' i]",
].join(", ");

const REPO_HOSTS = /github\.com|gitlab\.com|bitbucket\.org|sourcehut|codeberg\.org/i;
const SOCIAL_HOSTS =
  /linkedin\.com|twitter\.com|x\.com|instagram\.com|facebook\.com|youtube\.com|tiktok\.com|mastodon|threads\.net|discord/i;
const TAG_SELECTOR =
  "li, span, small, code, em, strong, [class*='tag' i], [class*='badge' i], [class*='chip' i], [class*='pill' i], [class*='stack' i], [class*='tech' i]";

const PROJECT_HEADING = /project|i've built|ive built|things i|case stud|portfolio|showcase|selected work|my work|featured/i;
const NOT_PROJECT_HEADING =
  /experience|employment|career|where i.?ve worked|education|testimonial|recommendation|blog|writing|articles|posts|newsletter|certificat|award|pricing|faq|services/i;

const MAX_SCANNED_ELEMENTS = 4000;
const MIN_GROUP_SCORE = 45;
const MIN_CARD_TEXT = 40;

/**
 * Titles that give away a navigation, footer, or blog-index entry. Repeated-sibling
 * detection finds these lists too, and their cards can otherwise out-score real ones.
 */
const NAV_TITLE =
  /^(home|about( me)?|blog|contact|privacy|terms|imprint|legal|cookies?|newsletter|subscribe|rss|sitemap|search|menu|login|sign in|sign up|skip to|read more|learn more|view all|see all|all posts|browse( by)?|categor(y|ies)|tags?|archive|older|newer|next|previous|page \d+|share|copyright|©)/i;

/** Screen-reader-only affordance text that ends up glued to a link's label. */
const A11Y_SUFFIX = /\s*\((?:opens?[^)]*new (?:tab|window)|external(?: link)?)\)\s*$/i;

/* ------------------------------- field extraction ------------------------------ */

function cleanTitle(raw: string): string {
  return collapse(raw).replace(A11Y_SUFFIX, "").trim().slice(0, 120);
}

function extractTitle(ctx: PageContext, card: Element): string {
  const { $ } = ctx;
  const node = $(card);

  const heading = cleanTitle(node.find("h1, h2, h3, h4, h5, h6").first().text());
  if (heading) return heading;

  const titleish = cleanTitle(
    node.find("[class*='title' i], [class*='name' i], [class*='heading' i]").first().text(),
  );
  if (titleish) return titleish;

  const linkText = cleanTitle(node.find("a[href]").first().text());
  if (linkText) return linkText;

  const strong = cleanTitle(node.find("strong, b").first().text());
  if (strong) return strong;

  const imageAlt = node.find("img[alt]").first().attr("alt");
  if (imageAlt) return cleanTitle(imageAlt);

  return cleanTitle(collapse(node.text()).split(" ").slice(0, 8).join(" "));
}

function extractDescription(ctx: PageContext, card: Element, title: string): string {
  const { $ } = ctx;
  const paragraphs = $(card)
    .find("p, [class*='desc' i], [class*='summary' i], [class*='excerpt' i], [class*='body' i]")
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter((text) => text.length > 20);

  if (paragraphs.length > 0) {
    // Deduplicate: nested wrappers report the same text at several levels.
    const unique = paragraphs.filter(
      (text, index) => !paragraphs.some((other, otherIndex) => otherIndex < index && other.includes(text)),
    );
    return unique.join(" ").slice(0, 600);
  }

  const own = collapse($(card).text());
  const withoutTitle = own.replace(title, "").trim();
  return withoutTitle.length > 20 ? withoutTitle.slice(0, 600) : "";
}

function extractLinks(
  ctx: PageContext,
  card: Element,
): { liveUrl: string | null; repoUrl: string | null } {
  const { $ } = ctx;
  let liveUrl: string | null = null;
  let repoUrl: string | null = null;

  $(card)
    .find("a[href]")
    .each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      const absolute = resolveUrl(href, ctx.finalUrl);
      if (!absolute) return;

      const label = `${collapse($(el).text())} ${$(el).attr("aria-label") ?? ""} ${
        $(el).attr("title") ?? ""
      }`.toLowerCase();

      if (REPO_HOSTS.test(absolute) || /\bsource\b|\bcode\b|\brepo\b/.test(label)) {
        repoUrl ??= absolute;
        return;
      }
      if (SOCIAL_HOSTS.test(absolute)) return;

      const sameOrigin = Boolean(ctx.origin) && absolute.startsWith(ctx.origin);
      const looksLikeDemo = /demo|live|visit|preview|launch|website|\bsite\b|view|try|open/.test(label);

      // Off-site links are the strongest live-demo signal. Same-origin links only count
      // when the label says so — otherwise they are just internal navigation.
      if (!sameOrigin || looksLikeDemo) liveUrl ??= absolute;
    });

  return { liveUrl, repoUrl };
}

/** Containers whose children are explicitly a stack listing rather than prose. */
const TECH_LIST_SELECTOR = [
  "[aria-label*='tech' i]",
  "[aria-label*='stack' i]",
  "[aria-label*='tool' i]",
  "[aria-label*='built with' i]",
  "[class*='tag' i]",
  "[class*='badge' i]",
  "[class*='chip' i]",
  "[class*='pill' i]",
  "[class*='stack' i]",
  "[class*='tech' i]",
].join(", ");

const NOT_A_TAG = /^(and|or|with|using|built|made|the|a|an|\d+)$/i;

function extractTechTags(ctx: PageContext, card: Element, description: string): string[] {
  const { $ } = ctx;
  const tagTexts = $(card)
    .find(TAG_SELECTOR)
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter((text) => text.length > 0 && text.length <= 28 && wordCount(text) <= 3);

  const fromTags = tagTexts.flatMap((text) => detectSkillNames(text, 2));
  const fromDescription = detectSkillNames(description, 6);

  /*
   * Take the labels of an explicit stack list verbatim as well. The taxonomy will never
   * cover every tool — a card listing "Zustand, Drizzle, Bun" was reported as having no
   * tech stack, which is both wrong and unfixable from the author's side.
   */
  const literal: string[] = [];
  $(card)
    .find(TECH_LIST_SELECTOR)
    .each((_, container) => {
      const children = $(container).children().toArray() as Element[];
      const texts =
        children.length > 0
          ? children.map((child) => collapse($(child).text()))
          : [collapse($(container).text())];

      for (const text of texts) {
        if (text.length === 0 || text.length > 24) continue;
        if (wordCount(text) > 3 || !/[a-z]/i.test(text) || NOT_A_TAG.test(text)) continue;
        literal.push(text);
      }
    });

  // Taxonomy names first so canonical spellings win over whatever the page typed.
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of [...fromTags, ...fromDescription, ...literal]) {
    const key = tag.toLowerCase().replace(/[.\s-]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags.slice(0, 10);
}

function countImages(ctx: PageContext, card: Element): number {
  const { $ } = ctx;
  const tags = $(card).find("img, picture source, video").length;
  const backgrounds = $(card)
    .find("[style*='url(']")
    .filter((_, el) => /url\(/i.test($(el).attr("style") ?? "")).length;
  return tags + backgrounds;
}

/* --------------------------------- group finding ------------------------------- */

function isCardLike(ctx: PageContext, el: Element): boolean {
  const node = ctx.$(el);
  if (collapse(node.text()).length < MIN_CARD_TEXT) return false;
  return (
    node.find("h1, h2, h3, h4, h5, h6").length > 0 ||
    node.find("a[href]").length > 0 ||
    node.find("img").length > 0
  );
}

/** Text of the closest heading above `el`, which is how a human tells these lists apart. */
function nearestHeadingText(ctx: PageContext, el: Element): string {
  const { $ } = ctx;
  let cursor = $(el);

  for (let depth = 0; depth < 6 && cursor.length > 0; depth++) {
    const heading = cursor.prevAll("h1, h2, h3, h4, h5, h6").first();
    if (heading.length > 0) return collapse(heading.text()).toLowerCase();

    const nested = cursor.prevAll().find("h1, h2, h3, h4, h5, h6").last();
    if (nested.length > 0) return collapse(nested.text()).toLowerCase();

    const parentHeading = cursor.parent().children("h1, h2, h3, h4, h5, h6").first();
    if (parentHeading.length > 0) return collapse(parentHeading.text()).toLowerCase();

    cursor = cursor.parent();
  }

  return "";
}

interface CardGroup {
  members: Element[];
  score: number;
}

function scoreGroup(ctx: PageContext, parent: Element, members: Element[]): number {
  const { $ } = ctx;
  let score = 0;

  const heading = nearestHeadingText(ctx, parent);
  if (PROJECT_HEADING.test(heading)) score += 35;
  if (NOT_PROJECT_HEADING.test(heading)) score -= 60;

  const hints = [selectorHints($, parent), selectorHints($, members[0])].join(" ");
  if (/project|portfolio|case|showcase|work|card|grid/.test(hints)) score += 20;
  if (/nav|menu|social|footer|breadcrumb|pagination|slider|carousel-nav/.test(hints)) score -= 40;

  let withImage = 0;
  let withRepo = 0;
  let withLive = 0;
  let withProse = 0;

  for (const member of members) {
    if (countImages(ctx, member) > 0) withImage += 1;
    const { liveUrl, repoUrl } = extractLinks(ctx, member);
    if (repoUrl) withRepo += 1;
    if (liveUrl) withLive += 1;
    if (wordCount(collapse($(member).text())) >= 12) withProse += 1;
  }

  const ratio = (value: number) => value / members.length;
  score += ratio(withImage) * 12;
  score += ratio(withRepo) * 18;
  score += ratio(withLive) * 12;
  score += ratio(withProse) * 15;

  // Two to a dozen entries is a projects grid; forty is a blog index or a nav tree.
  if (members.length >= 2 && members.length <= 12) score += 8;
  if (members.length > 20) score -= 25;

  return score;
}

function findCardGroups(ctx: PageContext, roots: Element[]): CardGroup[] {
  const { $ } = ctx;
  const groups: CardGroup[] = [];
  const parents: Element[] = [];
  let scanned = 0;

  for (const root of roots) {
    parents.push(root);
    $(root)
      .find("*")
      .each((_, el) => {
        if (scanned < MAX_SCANNED_ELEMENTS) {
          scanned += 1;
          parents.push(el as Element);
        }
      });
    if (scanned >= MAX_SCANNED_ELEMENTS) break;
  }

  const seen = new Set<Element>();

  for (const parent of parents) {
    if (seen.has(parent)) continue;
    seen.add(parent);

    const children = $(parent).children().toArray() as Element[];
    if (children.length < 2) continue;

    const byTag = new Map<string, Element[]>();
    for (const child of children) {
      const tag = child.tagName?.toLowerCase();
      if (!tag || ["script", "style", "br", "hr", "template", "noscript"].includes(tag)) continue;
      const existing = byTag.get(tag);
      if (existing) existing.push(child);
      else byTag.set(tag, [child]);
    }

    for (const members of byTag.values()) {
      if (members.length < 2) continue;
      const cards = members.filter((member) => isCardLike(ctx, member));
      if (cards.length < 2) continue;

      const score = scoreGroup(ctx, parent, cards);
      if (score >= MIN_GROUP_SCORE) groups.push({ members: cards, score });
    }
  }

  groups.sort((a, b) => b.score - a.score);
  if (groups.length === 0) return [];

  // Keep near-best groups too: "Featured" and "Other projects" are usually two grids.
  const cutoff = groups[0].score - 20;
  return groups.filter((group) => group.score >= cutoff).slice(0, 3);
}

/** Last resort: elements that name themselves a project, outermost first. */
function findNamedCards(ctx: PageContext): Element[] {
  const { $ } = ctx;
  const named = $(CONTAINER_SELECTOR)
    .toArray()
    .filter((el) => isCardLike(ctx, el as Element)) as Element[];

  return named.filter(
    (candidate) => !named.some((other) => other !== candidate && $(other).find(candidate).length > 0),
  );
}

function gradeProject(project: Omit<ProjectFinding, "quality" | "issues">): {
  quality: number;
  issues: string[];
} {
  const issues: string[] = [];
  let quality = 0;

  if (project.descriptionWords >= 25) {
    quality += 30;
  } else if (project.descriptionWords >= 12) {
    quality += 20;
    issues.push("description is thin — cover the problem, your role, and the outcome");
  } else if (project.descriptionWords >= 5) {
    quality += 10;
    issues.push("description is only a few words");
  } else {
    issues.push("no description");
  }

  if (project.liveUrl) quality += 25;
  else issues.push("no live demo link");

  if (project.repoUrl) quality += 20;
  else issues.push("no source code link");

  if (project.imageCount >= 1) quality += 15;
  else issues.push("no screenshot or preview image");

  if (project.techTags.length >= 2) quality += 10;
  else if (project.techTags.length === 1) quality += 5;
  else issues.push("no tech stack listed");

  return { quality: Math.min(100, quality), issues };
}

export function analyzeProjects(ctx: PageContext): ProjectsReport {
  const { $ } = ctx;

  // Scan an explicit projects container when one exists; otherwise the whole body.
  const explicit = $(CONTAINER_SELECTOR)
    .toArray()
    .filter((el) => $(el).find("*").length > 3) as Element[];
  const bodyRoot = ($("body").first()[0] ?? null) as Element | null;
  const roots = explicit.length > 0 ? explicit : bodyRoot ? [bodyRoot] : [];

  let cards = findCardGroups(ctx, roots).flatMap((group) => group.members);

  // Nothing repeated? Fall back to self-labelled cards, then to the whole body.
  if (cards.length === 0) cards = findNamedCards(ctx);
  if (cards.length === 0 && explicit.length > 0 && bodyRoot) {
    cards = findCardGroups(ctx, [bodyRoot]).flatMap((group) => group.members);
  }

  const seenTitles = new Set<string>();
  const projects: ProjectFinding[] = [];

  for (const card of cards) {
    const title = extractTitle(ctx, card);
    if (!title || title.length < 2) continue;
    if (NAV_TITLE.test(title)) continue;

    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);

    const description = extractDescription(ctx, card, title);
    const { liveUrl, repoUrl } = extractLinks(ctx, card);
    const base = {
      title,
      description,
      descriptionWords: wordCount(description),
      liveUrl,
      repoUrl,
      imageCount: countImages(ctx, card),
      techTags: extractTechTags(ctx, card, description),
    };

    // Evidence gate. A link alone is not enough — footer and category lists are full
    // of linked cards. Something has to mark this out as a piece of work: a preview
    // image, a repository, real prose, or a demo with a stated stack.
    const hasEvidence =
      base.imageCount > 0 ||
      base.repoUrl !== null ||
      base.descriptionWords >= 12 ||
      (base.liveUrl !== null && base.techTags.length > 0);
    if (!hasEvidence) continue;

    projects.push({ ...base, ...gradeProject(base) });
    if (projects.length >= 24) break;
  }

  const count = projects.length;
  const withDescription = projects.filter((project) => project.descriptionWords >= 12).length;
  const withLiveDemo = projects.filter((project) => project.liveUrl).length;
  const withRepo = projects.filter((project) => project.repoUrl).length;
  const withImage = projects.filter((project) => project.imageCount > 0).length;
  const averageQuality =
    count === 0
      ? 0
      : Math.round(projects.reduce((sum, project) => sum + project.quality, 0) / count);

  // Three solid projects is the bar; past that, depth matters more than volume.
  const countComponent = Math.min(100, (count / 3) * 100);
  const score = count === 0 ? 0 : Math.round(countComponent * 0.35 + averageQuality * 0.65);

  const of = (value: number) => `${value} of ${count}`;
  const checks: Check[] = [
    {
      id: "projects-count",
      label: "Project count",
      status: count >= 3 ? "pass" : count >= 1 ? "warn" : "fail",
      detail:
        count === 0
          ? "No projects detected — the single most important part of an applicant portfolio."
          : `${count} project${count === 1 ? "" : "s"} detected${count < 3 ? " — show at least 3." : "."}`,
    },
    {
      id: "projects-live",
      label: "Live demos",
      status: count > 0 && withLiveDemo === count ? "pass" : withLiveDemo > 0 ? "warn" : "fail",
      detail: `${of(withLiveDemo)} link to something a reviewer can open and use.`,
    },
    {
      id: "projects-repo",
      label: "Source code",
      status: count > 0 && withRepo === count ? "pass" : withRepo > 0 ? "warn" : "fail",
      detail: `${of(withRepo)} link to a repository. Reviewers want to read the code.`,
    },
    {
      id: "projects-description",
      label: "Descriptions",
      status: count > 0 && withDescription === count ? "pass" : withDescription > 0 ? "warn" : "fail",
      detail: `${of(withDescription)} have a description of 12+ words explaining the work.`,
    },
    {
      id: "projects-media",
      label: "Visual previews",
      status: count > 0 && withImage === count ? "pass" : withImage > 0 ? "warn" : "fail",
      detail: `${of(withImage)} include a screenshot, mockup, or video.`,
    },
  ];

  return {
    score,
    count,
    projects,
    withDescription,
    withLiveDemo,
    withRepo,
    withImage,
    averageQuality,
    checks,
  };
}
