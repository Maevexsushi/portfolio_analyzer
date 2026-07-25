import { probeLink } from "@/lib/fetcher";
import type { Check, EssentialLink, LinkFinding, LinkKind, LinksReport } from "@/lib/types";
import { mapLimit } from "./concurrency";
import type { PageContext } from "./context";
import { collapse, resolveUrl } from "./context";
import { scoreFromChecks } from "./check-utils";

/**
 * Link Checker.
 *
 * Extracts and classifies every link, then network-probes the outbound ones. Only
 * off-site links get probed: internal anchors cannot 404 in a way we can observe from
 * a single fetch, and re-requesting the same origin adds latency for little signal.
 */

const PLATFORMS: { platform: string; pattern: RegExp; kind: LinkKind }[] = [
  { platform: "GitHub", pattern: /github\.com/i, kind: "repo" },
  { platform: "GitLab", pattern: /gitlab\.com/i, kind: "repo" },
  { platform: "Bitbucket", pattern: /bitbucket\.org/i, kind: "repo" },
  { platform: "LinkedIn", pattern: /linkedin\.com/i, kind: "social" },
  { platform: "X / Twitter", pattern: /twitter\.com|(?:^|\/\/)x\.com/i, kind: "social" },
  { platform: "Instagram", pattern: /instagram\.com/i, kind: "social" },
  { platform: "Dribbble", pattern: /dribbble\.com/i, kind: "social" },
  { platform: "Behance", pattern: /behance\.net/i, kind: "social" },
  { platform: "YouTube", pattern: /youtube\.com|youtu\.be/i, kind: "social" },
  { platform: "Medium", pattern: /medium\.com/i, kind: "social" },
  { platform: "Dev.to", pattern: /dev\.to/i, kind: "social" },
  { platform: "Stack Overflow", pattern: /stackoverflow\.com/i, kind: "social" },
  { platform: "CodePen", pattern: /codepen\.io/i, kind: "social" },
  { platform: "Mastodon", pattern: /mastodon\.|fosstodon/i, kind: "social" },
  { platform: "Threads", pattern: /threads\.net/i, kind: "social" },
  { platform: "Telegram", pattern: /t\.me|telegram\./i, kind: "social" },
  { platform: "Discord", pattern: /discord\.(gg|com)/i, kind: "social" },
];

const RESUME_PATTERN = /resume|\bcv\b|curriculum[-_ ]?vitae/i;
const PLACEHOLDER_PATTERN = /^(#|javascript:void\(0\)|javascript:;|)$/i;

/**
 * Webmail compose links are email contacts too.
 *
 * Plenty of portfolios link a Gmail or Outlook compose URL instead of `mailto:` —
 * it opens a pre-filled message in one click, which is exactly what the check is for.
 * Treating only `mailto:` as an email contact reported these pages as having none.
 */
const WEBMAIL_COMPOSE =
  /^https?:\/\/(mail\.google\.com\/mail|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.proton\.me|compose\.mail\.yahoo\.com)/i;

/**
 * Visible-text email address, used to give partial credit when nothing is linked.
 * Only the rendered text is searched, so form `placeholder` values (the usual source
 * of dummy addresses) are out of scope by construction.
 */
const EMAIL_IN_TEXT = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}\b/;

/** The recipient a webmail compose URL is addressed to, for display. */
function composeRecipient(url: string): string | null {
  try {
    const parsed = new URL(url);
    const to = parsed.searchParams.get("to") ?? parsed.searchParams.get("mailto");
    return to ? to.split(",")[0] : null;
  } catch {
    return null;
  }
}

function classify(
  href: string,
  absolute: string,
  text: string,
  origin: string,
): { kind: LinkKind; platform: string | null } {
  if (href.startsWith("mailto:")) return { kind: "email", platform: null };
  if (href.startsWith("tel:")) return { kind: "phone", platform: null };
  if (href.startsWith("#")) return { kind: "anchor", platform: null };
  if (WEBMAIL_COMPOSE.test(absolute)) return { kind: "email", platform: "Webmail compose" };

  for (const entry of PLATFORMS) {
    if (entry.pattern.test(absolute)) return { kind: entry.kind, platform: entry.platform };
  }

  if (RESUME_PATTERN.test(absolute) || RESUME_PATTERN.test(text)) {
    return { kind: "resume", platform: null };
  }

  if (origin && absolute.startsWith(origin)) return { kind: "internal", platform: null };
  return { kind: "external", platform: null };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Kinds worth spending a network request on. */
const PROBED_KINDS = new Set<LinkKind>(["social", "repo", "resume", "external"]);

export async function analyzeLinks(
  ctx: PageContext,
  options: { checkLinks: boolean; maxLinkChecks: number },
): Promise<LinksReport> {
  const { $ } = ctx;
  const byUrl = new Map<string, LinkFinding>();
  let placeholderCount = 0;
  let emptyTextCount = 0;
  let unsafeTargetCount = 0;

  $("a").each((_, el) => {
    const node = $(el);
    const href = (node.attr("href") ?? "").trim();
    const text = collapse(node.text()) || collapse(node.attr("aria-label") ?? "");

    if (PLACEHOLDER_PATTERN.test(href)) {
      placeholderCount += 1;
      return;
    }

    // An icon-only link with no accessible name is unusable for screen readers.
    if (!text && !node.find("img[alt], svg title, [aria-label]").length) emptyTextCount += 1;

    if (
      node.attr("target") === "_blank" &&
      !/noopener|noreferrer/i.test(node.attr("rel") ?? "")
    ) {
      unsafeTargetCount += 1;
    }

    const absolute = href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")
      ? href
      : resolveUrl(href, ctx.finalUrl);
    if (!absolute) return;

    const { kind, platform } = classify(href, absolute, text, ctx.origin);
    if (byUrl.has(absolute)) return;

    byUrl.set(absolute, {
      url: absolute,
      text: text.slice(0, 120),
      kind,
      platform,
      checked: false,
      status: null,
      ok: null,
      blocked: false,
      error: null,
      redirectedTo: null,
    });
  });

  const links = [...byUrl.values()];

  const probeTargets = links.filter((link) => PROBED_KINDS.has(link.kind));
  // Prefer the links that matter to a reviewer when we hit the probe budget.
  probeTargets.sort((a, b) => {
    const rank = (link: LinkFinding) =>
      link.kind === "repo" ? 0 : link.kind === "resume" ? 1 : link.kind === "social" ? 2 : 3;
    return rank(a) - rank(b);
  });

  const toProbe = options.checkLinks ? probeTargets.slice(0, options.maxLinkChecks) : [];
  const skipped = probeTargets.length - toProbe.length;

  await mapLimit(toProbe, 6, async (link) => {
    const probe = await probeLink(link.url);
    link.checked = true;
    link.status = probe.status;
    link.ok = probe.ok;
    link.blocked = probe.blocked;
    link.error = probe.error;
    link.redirectedTo = probe.redirectedTo;
  });

  const checkedCount = links.filter((link) => link.checked).length;
  const broken = links.filter((link) => link.checked && link.ok === false);
  const unverified = links.filter((link) => link.checked && link.blocked);

  const findEssential = (
    id: string,
    label: string,
    predicate: (link: LinkFinding) => boolean,
  ): EssentialLink => {
    const match = links.find(predicate);
    return {
      id,
      label,
      found: Boolean(match),
      url: match?.url ?? null,
      status: match ? "pass" : "fail",
      note: null,
    };
  };

  const essentials: EssentialLink[] = [
    findEssential("github", "GitHub profile", (link) => link.platform === "GitHub"),
    findEssential("linkedin", "LinkedIn profile", (link) => link.platform === "LinkedIn"),
    findEssential("email", "Email address", (link) => link.kind === "email"),
    findEssential("resume", "Resume / CV link", (link) => link.kind === "resume"),
  ];

  // An address printed as plain text is worth partial credit: the information is there,
  // it just costs the reader a copy-paste.
  const emailEssential = essentials.find((entry) => entry.id === "email")!;
  const textEmail = EMAIL_IN_TEXT.exec(ctx.text)?.[0] ?? null;
  if (!emailEssential.found && textEmail) {
    emailEssential.status = "warn";
    emailEssential.url = null;
    emailEssential.note = `${textEmail} appears in the page text but is not a clickable link`;
  } else if (emailEssential.found) {
    const link = links.find((candidate) => candidate.kind === "email");
    const recipient = link ? composeRecipient(link.url) : null;
    if (recipient) emailEssential.note = `webmail compose link to ${recipient}`;
  }

  const brokenEssential = essentials.some(
    (essential) =>
      essential.url && broken.some((link) => link.url === essential.url),
  );

  const checks: Check[] = [];

  // Distinct ids matter: only the real result should drive a "fix your links" suggestion.
  if (options.checkLinks) {
    checks.push({
      id: "links-broken",
      label: "No broken links",
      status: broken.length === 0 ? "pass" : broken.length <= 2 ? "warn" : "fail",
      detail:
        (broken.length === 0
          ? `All ${checkedCount} outbound link${checkedCount === 1 ? "" : "s"} responded successfully.`
          : `${broken.length} of ${checkedCount} checked links failed: ${broken
              .slice(0, 3)
              .map((link) => `${hostOf(link.url)} (${link.error ?? link.status})`)
              .join(", ")}${broken.length > 3 ? "…" : "."}`) +
        (unverified.length > 0
          ? ` ${unverified.length} host${unverified.length === 1 ? "" : "s"} refused automated checks and could not be verified either way.`
          : ""),
    });
  } else {
    checks.push({
      id: "links-not-checked",
      label: "Link health",
      status: "warn",
      detail: "Link checking was skipped for this run, so broken links would not be reported.",
    });
  }

  checks.push(
    {
      id: "links-github",
      label: "GitHub linked",
      status: essentials[0].found ? "pass" : "fail",
      detail: essentials[0].found
        ? `Linked: ${essentials[0].url}`
        : "No GitHub link found. Reviewers will look for your code first.",
    },
    {
      id: "links-linkedin",
      label: "LinkedIn linked",
      status: essentials[1].found ? "pass" : "warn",
      detail: essentials[1].found
        ? `Linked: ${essentials[1].url}`
        : "No LinkedIn link found — most recruiters expect one.",
    },
    {
      id: "links-email",
      label: "Email contact",
      status: emailEssential.status,
      detail:
        emailEssential.status === "pass"
          ? `Reachable by email — ${emailEssential.note ?? emailEssential.url?.replace("mailto:", "")}.`
          : emailEssential.status === "warn"
            ? `${emailEssential.note}. Wrap it in a mailto: link so one click opens a draft.`
            : "No email link and no address in the page text. A contact form alone loses people who prefer email.",
    },
    {
      id: "links-resume",
      label: "Resume / CV available",
      status: essentials[3].found ? "pass" : "warn",
      detail: essentials[3].found
        ? `Resume linked: ${essentials[3].url}`
        : "No resume or CV link found.",
    },
    {
      id: "links-placeholder",
      label: "No placeholder links",
      status: placeholderCount === 0 ? "pass" : placeholderCount <= 2 ? "warn" : "fail",
      detail:
        placeholderCount === 0
          ? "No dead-end href=\"#\" links."
          : `${placeholderCount} link${placeholderCount === 1 ? "" : "s"} point to "#" or javascript:void(0) and go nowhere.`,
    },
    {
      id: "links-accessible-name",
      label: "Links have accessible text",
      status: emptyTextCount === 0 ? "pass" : emptyTextCount <= 2 ? "warn" : "fail",
      detail:
        emptyTextCount === 0
          ? "Every link has visible text or an accessible label."
          : `${emptyTextCount} link${emptyTextCount === 1 ? " has" : "s have"} no text and no aria-label — invisible to screen readers.`,
    },
    {
      id: "links-rel-noopener",
      label: "External links use rel=noopener",
      status: unsafeTargetCount === 0 ? "pass" : "warn",
      detail:
        unsafeTargetCount === 0
          ? "New-tab links are safely marked."
          : `${unsafeTargetCount} target="_blank" link${unsafeTargetCount === 1 ? "" : "s"} missing rel="noopener".`,
    },
  );

  if (brokenEssential) {
    checks.push({
      id: "links-essential-broken",
      label: "Essential links reachable",
      status: "fail",
      detail: "One of your key links (GitHub, LinkedIn, email, resume) is broken.",
    });
  }

  if (skipped > 0) {
    checks.push({
      id: "links-budget",
      label: "Probe coverage",
      status: "warn",
      detail: `${skipped} outbound link${skipped === 1 ? "" : "s"} were not probed (per-run limit of ${options.maxLinkChecks}).`,
    });
  }

  const score = scoreFromChecks(checks, {
    "links-broken": 3,
    "links-github": 2,
    "links-email": 2,
    "links-essential-broken": 3,
    "links-linkedin": 1.5,
    "links-resume": 1.5,
    "links-placeholder": 1,
    "links-accessible-name": 1,
    "links-rel-noopener": 0.5,
    "links-budget": 0.25,
    "links-not-checked": 0.5,
  });

  return {
    score,
    total: links.length,
    checkedCount,
    brokenCount: broken.length,
    unverifiedCount: unverified.length,
    unverified,
    links,
    broken,
    essentials,
    checks,
  };
}
