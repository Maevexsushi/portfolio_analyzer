import type {
  CategoryKey,
  Check,
  DesignReport,
  LinksReport,
  PerformanceReport,
  ProjectsReport,
  SectionsReport,
  Severity,
  SkillsReport,
  Suggestion,
} from "@/lib/types";

/**
 * Suggestions Generator.
 *
 * Every failing or warning check maps to one actionable fix. The check already explains
 * what is wrong, so a rule only supplies the instruction and a rough point value; a warn
 * is worth half of a fail. This keeps advice and evidence from drifting apart.
 */

interface Rule {
  category: CategoryKey;
  severity: Severity;
  /** Estimated overall points recovered by fixing this outright. */
  impact: number;
  title: string;
  action: string;
}

const RULES: Record<string, Rule> = {
  /* projects */
  "projects-count": {
    category: "projects",
    severity: "critical",
    impact: 12,
    title: "Show at least three projects",
    action:
      "Publish three projects you can talk through in an interview. Two strong ones beat six thin ones, but under three the page reads as a placeholder.",
  },
  "projects-live": {
    category: "projects",
    severity: "critical",
    impact: 6,
    title: "Add a live demo link to every project",
    action:
      "Deploy each project (Vercel, Netlify, and Render all have free tiers) and link it. Reviewers rarely clone a repo to see whether something works.",
  },
  "projects-repo": {
    category: "projects",
    severity: "important",
    impact: 5,
    title: "Link the source code for each project",
    action:
      "Add a GitHub link per project, and make sure each repo has a README with setup steps and a screenshot.",
  },
  "projects-description": {
    category: "projects",
    severity: "critical",
    impact: 6,
    title: "Describe what each project does and what you did",
    action:
      "Write 2-3 sentences per project: the problem, your specific contribution, and the result. Name the hard part you solved.",
  },
  "projects-media": {
    category: "projects",
    severity: "important",
    impact: 4,
    title: "Add a screenshot to each project",
    action:
      "Include a screenshot, GIF, or short clip per project. A visual is what stops the scroll.",
  },

  /* skills */
  "skills-section": {
    category: "skills",
    severity: "important",
    impact: 5,
    title: "Add a dedicated skills section",
    action:
      "Group your technologies into a scannable list under a 'Skills' or 'Tech Stack' heading. It is the first thing recruiters look for.",
  },
  "skills-count": {
    category: "skills",
    severity: "important",
    impact: 4,
    title: "List more of your stack",
    action:
      "Name the languages, frameworks, databases, and tooling you actually use — including testing and deployment, which most portfolios omit.",
  },
  "skills-coverage": {
    category: "skills",
    severity: "polish",
    impact: 3,
    title: "Broaden the categories you cover",
    action:
      "Show range across languages, frontend, backend, and deployment. Gaps here read as narrow experience even when it isn't.",
  },

  /* links */
  "links-broken": {
    category: "links",
    severity: "critical",
    impact: 6,
    title: "Fix the broken links",
    action:
      "A dead link on a portfolio is the single easiest thing to hold against you. Fix or remove each one.",
  },
  "links-essential-broken": {
    category: "links",
    severity: "critical",
    impact: 6,
    title: "Repair your key links first",
    action: "Your GitHub, LinkedIn, email, or resume link is broken — fix it before anything else.",
  },
  "links-github": {
    category: "links",
    severity: "critical",
    impact: 5,
    title: "Link your GitHub profile",
    action:
      "Add a GitHub link in the header or footer, and pin your best repositories on the profile itself.",
  },
  "links-email": {
    category: "links",
    severity: "critical",
    impact: 4,
    title: "Add a direct email link",
    action:
      "Include a mailto: link. Contact forms silently fail and many reviewers will not fill one in.",
  },
  "links-linkedin": {
    category: "links",
    severity: "important",
    impact: 3,
    title: "Link your LinkedIn profile",
    action: "Recruiters check LinkedIn next; make the jump obvious.",
  },
  "links-resume": {
    category: "links",
    severity: "important",
    impact: 3,
    title: "Link a downloadable resume",
    action: "Add a 'Resume' link to a PDF so a reviewer can forward it internally in one click.",
  },
  "links-placeholder": {
    category: "links",
    severity: "important",
    impact: 2,
    title: "Remove placeholder links",
    action: "Links pointing at \"#\" look unfinished. Wire them up or take them out.",
  },
  "links-accessible-name": {
    category: "links",
    severity: "important",
    impact: 2,
    title: "Label icon-only links",
    action:
      "Give each icon link an aria-label (e.g. aria-label=\"GitHub profile\") so it is usable with a screen reader.",
  },
  "links-rel-noopener": {
    category: "links",
    severity: "polish",
    impact: 1,
    title: "Add rel=\"noopener\" to new-tab links",
    action: "Use rel=\"noopener noreferrer\" on every target=\"_blank\" link.",
  },

  /* design */
  "design-viewport": {
    category: "design",
    severity: "critical",
    impact: 8,
    title: "Add the responsive viewport meta tag",
    action:
      "Put <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> in <head>. Without it the page renders desktop-width on phones.",
  },
  "design-media-queries": {
    category: "design",
    severity: "critical",
    impact: 4,
    title: "Make the layout responsive",
    action:
      "Add breakpoints for phone and tablet widths, then check the page at 375px wide. Many reviewers open portfolios on a phone.",
  },
  "design-zoom": {
    category: "design",
    severity: "important",
    impact: 2,
    title: "Allow pinch zoom",
    action: "Remove user-scalable=no and maximum-scale from the viewport tag.",
  },
  "design-h1": {
    category: "design",
    severity: "important",
    impact: 3,
    title: "Use exactly one H1",
    action: "Make the H1 your name plus the role you want, and demote the rest to H2.",
  },
  "design-heading-order": {
    category: "design",
    severity: "polish",
    impact: 2,
    title: "Fix the heading hierarchy",
    action: "Do not skip levels — H2 should follow H1, H3 should follow H2.",
  },
  "design-alt-text": {
    category: "design",
    severity: "important",
    impact: 4,
    title: "Write alt text for every image",
    action:
      "Describe each image's content, or use alt=\"\" for purely decorative ones. This is table stakes for accessibility.",
  },
  "design-semantics": {
    category: "design",
    severity: "polish",
    impact: 2,
    title: "Use semantic HTML landmarks",
    action: "Replace wrapper divs with <header>, <nav>, <main>, <section>, and <footer>.",
  },
  "design-title": {
    category: "design",
    severity: "important",
    impact: 3,
    title: "Write a proper page title",
    action: "Use a title like \"Jane Doe — Frontend Developer\", between 15 and 70 characters.",
  },
  "design-description": {
    category: "design",
    severity: "important",
    impact: 3,
    title: "Add a meta description",
    action:
      "Write a 50-160 character summary of who you are and what you build; it becomes your search-result snippet.",
  },
  "design-social-preview": {
    category: "design",
    severity: "polish",
    impact: 2,
    title: "Add Open Graph tags",
    action:
      "Set og:title, og:description, and og:image so shared links render a card instead of a bare URL.",
  },
  "design-favicon": {
    category: "design",
    severity: "polish",
    impact: 1,
    title: "Add a favicon",
    action: "A default browser icon in the tab reads as unfinished.",
  },
  "design-lang": {
    category: "design",
    severity: "polish",
    impact: 1,
    title: "Declare the page language",
    action: "Add lang=\"en\" (or the correct language) to the <html> element.",
  },
  "design-palette": {
    category: "design",
    severity: "polish",
    impact: 2,
    title: "Tighten the colour palette",
    action:
      "Define a small set of CSS variables — one or two brand colours plus neutrals — and use them consistently.",
  },
  "design-fonts": {
    category: "design",
    severity: "polish",
    impact: 2,
    title: "Reduce the number of typefaces",
    action: "Stick to two families: one for headings, one for body text.",
  },
  "design-dark-mode": {
    category: "design",
    severity: "polish",
    impact: 1,
    title: "Support dark mode",
    action: "Add a prefers-color-scheme media query so the page matches the visitor's system theme.",
  },
  "design-contrast": {
    category: "design",
    severity: "critical",
    impact: 4,
    title: "Increase text contrast",
    action:
      "Body text needs a 4.5:1 contrast ratio against its background. Light grey on white is the most common offender.",
  },
  "design-content-depth": {
    category: "design",
    severity: "important",
    impact: 4,
    title: "Write more about your work",
    action:
      "Aim for 300+ words. Explain what you build, how you work, and what you are looking for.",
  },
  "design-link-text": {
    category: "design",
    severity: "polish",
    impact: 1,
    title: "Use descriptive link text",
    action: "Replace \"click here\" and \"read more\" with the destination, e.g. \"View the case study\".",
  },
  "design-inline-styles": {
    category: "design",
    severity: "polish",
    impact: 1,
    title: "Move inline styles into stylesheets",
    action: "Consolidate inline style attributes into CSS classes so the design stays consistent.",
  },

  /* performance */
  "perf-ttfb": {
    category: "performance",
    severity: "important",
    impact: 3,
    title: "Speed up the server response",
    action:
      "Serve the page from a CDN or static host. Free tiers that cold-start are the usual cause of a slow first byte.",
  },
  "perf-html-size": {
    category: "performance",
    severity: "polish",
    impact: 2,
    title: "Trim the HTML document",
    action: "Remove unused markup and move large inline payloads into cacheable files.",
  },
  "perf-page-weight": {
    category: "performance",
    severity: "important",
    impact: 3,
    title: "Reduce total page weight",
    action:
      "Compress and resize images — they are almost always the bulk of it. Target under 1 MB for the whole page.",
  },
  "perf-requests": {
    category: "performance",
    severity: "polish",
    impact: 1,
    title: "Cut the request count",
    action: "Bundle scripts and styles, and drop libraries you are not using.",
  },
  "perf-blocking-scripts": {
    category: "performance",
    severity: "important",
    impact: 2,
    title: "Defer render-blocking scripts",
    action: "Add defer (or async) to script tags so the page paints before the JS parses.",
  },
  "perf-blocking-styles": {
    category: "performance",
    severity: "polish",
    impact: 1,
    title: "Consolidate stylesheets",
    action: "Combine your CSS into one file to remove extra round trips.",
  },
  "perf-lazy-images": {
    category: "performance",
    severity: "polish",
    impact: 2,
    title: "Lazy-load below-the-fold images",
    action: "Add loading=\"lazy\" to every image that is not visible on first paint.",
  },
  "perf-image-dimensions": {
    category: "performance",
    severity: "important",
    impact: 2,
    title: "Set image dimensions",
    action:
      "Give every image explicit width and height (or aspect-ratio) so content does not jump as images load.",
  },
  "perf-image-formats": {
    category: "performance",
    severity: "polish",
    impact: 2,
    title: "Convert images to WebP or AVIF",
    action: "Re-export PNG and JPEG assets as WebP; expect 25-50% smaller files at the same quality.",
  },
  "perf-heavy-asset": {
    category: "performance",
    severity: "important",
    impact: 3,
    title: "Shrink your largest asset",
    action:
      "One oversized file can dominate load time. Resize it to its display size and compress it.",
  },
  "perf-inline-payload": {
    category: "performance",
    severity: "polish",
    impact: 1,
    title: "Externalise large inline CSS/JS",
    action: "Move big inline blocks into files so browsers can cache them across visits.",
  },
  "perf-compression": {
    category: "performance",
    severity: "important",
    impact: 4,
    title: "Enable gzip or brotli compression",
    action:
      "Turn on compression at the host or CDN. It typically cuts HTML transfer size by 70% for one config line.",
  },
  "perf-caching": {
    category: "performance",
    severity: "polish",
    impact: 2,
    title: "Add caching headers",
    action: "Set Cache-Control with a max-age of at least an hour on static assets.",
  },
  "perf-https": {
    category: "performance",
    severity: "critical",
    impact: 6,
    title: "Serve the site over HTTPS",
    action:
      "Enable TLS (free via Let's Encrypt, or automatic on Netlify, Vercel, and GitHub Pages). A 'Not secure' badge next to your URL undermines everything else.",
  },
  "perf-third-party": {
    category: "performance",
    severity: "polish",
    impact: 1,
    title: "Reduce third-party requests",
    action: "Self-host fonts and drop analytics or widgets you do not read.",
  },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, important: 1, polish: 2 };

/** Missing sections are described by the sections report, not by a check, so map them here. */
const SECTION_ADVICE: Record<string, { severity: Severity; impact: number; action: string }> = {
  hero: {
    severity: "important",
    impact: 5,
    action:
      "Open with your name, the role you are targeting, and one line on what you do. A visitor should know who you are in three seconds.",
  },
  about: {
    severity: "important",
    impact: 5,
    action:
      "Add a short About section: your background, what you are working on now, and what you are looking for.",
  },
  projects: {
    severity: "critical",
    impact: 10,
    action:
      "Add a Projects section with a heading a reviewer can scan to. This is the part of the page that gets you interviews.",
  },
  skills: {
    severity: "important",
    impact: 5,
    action: "Add a Skills or Tech Stack section listing the technologies you work with.",
  },
  experience: {
    severity: "important",
    impact: 5,
    action:
      "Add an Experience section. Internships, freelance work, and open-source contributions all count.",
  },
  contact: {
    severity: "critical",
    impact: 6,
    action:
      "Add a Contact section with an email address. Someone who wants to hire you should not have to hunt.",
  },
};

interface Reports {
  sections: SectionsReport;
  projects: ProjectsReport;
  skills: SkillsReport;
  links: LinksReport;
  design: DesignReport;
  performance: PerformanceReport;
}

export function generateSuggestions(reports: Reports): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const allChecks: Check[] = [
    ...reports.projects.checks,
    ...reports.skills.checks,
    ...reports.links.checks,
    ...reports.design.checks,
    ...reports.performance.checks,
  ];

  for (const check of allChecks) {
    if (check.status === "pass") continue;
    const rule = RULES[check.id];
    if (!rule) continue;

    suggestions.push({
      id: check.id,
      category: rule.category,
      // A warning is a smaller problem than a failure, so soften critical warnings.
      severity:
        check.status === "warn" && rule.severity === "critical" ? "important" : rule.severity,
      title: rule.title,
      detail: `${check.detail} ${rule.action}`,
      impact: check.status === "fail" ? rule.impact : Math.max(1, Math.round(rule.impact / 2)),
    });
  }

  for (const section of reports.sections.sections) {
    if (section.found || !section.required) continue;
    const advice = SECTION_ADVICE[section.id];
    if (!advice) continue;
    suggestions.push({
      id: `section-${section.id}`,
      category: "sections",
      severity: advice.severity,
      title: `Add a ${section.label} section`,
      detail: `No ${section.label.toLowerCase()} section was detected. ${advice.action}`,
      impact: advice.impact,
    });
  }

  // Call out the weakest individual project — aggregate check details hide which one.
  const weakest = [...reports.projects.projects].sort((a, b) => a.quality - b.quality)[0];
  if (weakest && weakest.quality < 60 && weakest.issues.length > 0) {
    suggestions.push({
      id: "project-weakest",
      category: "projects",
      severity: "important",
      title: `Strengthen "${weakest.title.slice(0, 60)}"`,
      detail: `This is your weakest entry (${weakest.quality}/100): ${weakest.issues.join("; ")}.`,
      impact: 3,
    });
  }

  return suggestions.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : b.impact - a.impact;
  });
}
