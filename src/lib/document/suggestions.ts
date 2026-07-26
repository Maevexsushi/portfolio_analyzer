import type { CategoryKey, Check, Severity, Suggestion } from "@/lib/types";
import type { DisciplineProfile } from "@/lib/discipline/types";

/**
 * Suggestions for uploaded documents.
 *
 * Same contract as the website generator: one failing check becomes one instruction,
 * and the check's own detail supplies the evidence so advice and evidence cannot drift.
 * A few of the actions are written by the discipline profile rather than fixed here,
 * because "add a case study" and "link your repositories" are the same advice aimed at
 * different fields.
 */

interface Rule {
  category: CategoryKey;
  severity: Severity;
  impact: number;
  title: string;
  warnTitle?: string;
  action: string | ((profile: DisciplineProfile) => string);
}

const RULES: Record<string, Rule> = {
  /* contact */
  "contact-email": {
    category: "contact",
    severity: "critical",
    impact: 12,
    title: "Put an email address in the text",
    action:
      "Type it as text near the top. Not in a header image, not behind an icon — a recruiter needs to copy it into a reply.",
  },
  "contact-phone": {
    category: "contact",
    severity: "polish",
    impact: 3,
    title: "Add a phone number",
    action: "Recruiters who shortlist by phone will skip anyone they cannot call.",
  },
  "contact-name": {
    category: "contact",
    severity: "important",
    impact: 6,
    title: "Make sure your name is real text",
    action:
      "If it is set in a decorative font or sits inside an image, retype it as text. Every system that files your application reads that line first.",
  },
  "contact-location": {
    category: "contact",
    severity: "polish",
    impact: 3,
    title: "State your location",
    action: "A city and country — or 'Remote' — answers the first filter a recruiter applies.",
  },
  "contact-proof": {
    category: "contact",
    severity: "critical",
    impact: 8,
    warnTitle: "Add the profile links this field expects",
    title: "Link somewhere your work can be seen",
    action: (profile) =>
      profile.platforms
        .filter((platform) => platform.weight === "expected")
        .map((platform) => platform.note)
        .join(" ") || "Link a profile that shows your work.",
  },
  "contact-clickable": {
    category: "contact",
    severity: "polish",
    impact: 2,
    title: "Make your URLs clickable",
    action:
      "Insert them as hyperlinks rather than typing them. Most of this document's readers are on a screen.",
  },

  /* structure */
  "structure-required": {
    category: "structure",
    severity: "critical",
    impact: 10,
    warnTitle: "Add the missing section",
    title: "Add the sections recruiters look for",
    action:
      "Use the conventional names — Experience, Education, Skills. Creativity in the headings costs you the skim.",
  },
  "structure-summary": {
    category: "structure",
    severity: "important",
    impact: 5,
    title: "Open with a three-line summary",
    action:
      "What you do, your level, and what you are looking for. It frames everything a reader sees below it.",
  },
  "structure-headings": {
    category: "structure",
    severity: "important",
    impact: 6,
    title: "Break it into scannable sections",
    action: "Clear headings are what make a seven-second read possible.",
  },
  "structure-order": {
    category: "structure",
    severity: "important",
    impact: 4,
    title: "Put your most recent role first",
    action: "Readers start at the top and stop early. Oldest-first buries what matters most.",
  },
  "structure-bonus": {
    category: "structure",
    severity: "polish",
    impact: 3,
    title: "Add a supporting section",
    action:
      "Certifications, projects, publications, or volunteering — this is where two similar candidates separate.",
  },

  /* experience */
  "experience-entries": {
    category: "experience",
    severity: "critical",
    impact: 10,
    title: "Make your roles readable as separate entries",
    action:
      "Give each role its own line with the job title, employer, and dates together. If those sit in a side column, they arrive scrambled.",
  },
  "experience-bullets": {
    category: "experience",
    severity: "critical",
    impact: 8,
    title: "Write three to five bullets per recent role",
    action: "Paragraphs of duties do not get read. Bullets do.",
  },
  "experience-quantified": {
    category: "experience",
    severity: "critical",
    impact: 14,
    warnTitle: "Put numbers on more of your achievements",
    title: "Put numbers on your achievements",
    action:
      "Go through each bullet and ask 'how much, how many, how fast, compared to what'. Aim for a number in at least four of every ten. This is the highest-value edit on the whole document.",
  },
  "experience-verbs": {
    category: "experience",
    severity: "important",
    impact: 7,
    title: "Start every bullet with what you did",
    action:
      "Replace 'Responsible for managing X' with 'Managed X'. Same length, and it credits you rather than the job description.",
  },
  "experience-outcomes": {
    category: "experience",
    severity: "important",
    impact: 6,
    title: "Say what changed because you were there",
    action: (profile) =>
      `In this field that means outcomes like ${profile.outcomeTerms.slice(0, 4).join(", ")}. Describe the result, not only the activity.`,
  },

  /* ats */
  "ats-readable": {
    category: "ats",
    severity: "critical",
    impact: 25,
    title: "Send a file with real text in it",
    action:
      "Export a PDF from the original document. A scan or an exported image is stored by employer systems as an empty record, so no search ever returns it — this outranks every other fix here.",
  },
  "ats-headings": {
    category: "ats",
    severity: "important",
    impact: 7,
    title: "Use conventional section headings",
    action:
      "'Experience', 'Education', 'Skills'. Parsers map those to fields; anything inventive gets filed nowhere.",
  },
  "ats-columns": {
    category: "ats",
    severity: "important",
    impact: 8,
    title: "Move to a single-column layout",
    action:
      "Copy your whole resume into a plain text editor. If it comes out shuffled, that is what the employer receives — and a side column is usually why.",
  },
  "ats-filename": {
    category: "ats",
    severity: "polish",
    impact: 2,
    title: "Rename the file",
    action: "Firstname-Lastname-Role.pdf. It is the first thing in the recruiter's inbox.",
  },
  "ats-density": {
    category: "ats",
    severity: "polish",
    impact: 3,
    title: "Adjust the text density",
    action: "Aim for a page that can be skimmed without being sparse.",
  },
  "ats-images": {
    category: "ats",
    severity: "important",
    impact: 5,
    title: "Take your content out of images",
    action:
      "Skill charts and graphic headers carry text no parser can read. Whatever they say, say it again as text.",
  },

  /* language */
  "language-cliches": {
    category: "language",
    severity: "important",
    impact: 5,
    title: "Cut the stock phrases",
    action:
      "'Hard-working team player' describes every applicant equally. Replace each one with the specific thing that made you write it.",
  },
  "language-length": {
    category: "language",
    severity: "polish",
    impact: 3,
    title: "Shorten the long sentences",
    action: "One idea per bullet. A long sentence is skipped whole, not read slowly.",
  },
  "language-passive": {
    category: "language",
    severity: "polish",
    impact: 3,
    title: "Switch to the active voice",
    action:
      "'The migration was completed' hides who completed it. On your own resume, that is you.",
  },
  "language-firstperson": {
    category: "language",
    severity: "polish",
    impact: 2,
    title: "Drop the first-person pronouns",
    action: "'Led the migration', not 'I led the migration'. The convention buys you the space.",
  },

  /* work */
  "work-count": {
    category: "work",
    severity: "critical",
    impact: 14,
    title: "Show at least three pieces of work",
    action: (profile) =>
      `Three ${profile.workNoun.plural} you can talk through beats a gallery of thumbnails. Give each one a titled page with a heading that comes through as text.`,
  },
  "work-depth": {
    category: "work",
    severity: "critical",
    impact: 12,
    warnTitle: "Say more about each piece",
    title: "Explain the work, not just show it",
    action: (profile) =>
      `For each ${profile.workNoun.singular}, cover ${profile.depthExpectations.join("; ")}. Finished images show what you made; the words are what show your judgement.`,
  },
  "work-outcomes": {
    category: "work",
    severity: "important",
    impact: 8,
    title: "State what came of the work",
    action: (profile) =>
      `Say what changed — ${profile.outcomeTerms.slice(0, 4).join(", ")}. Without it a reviewer can only judge the surface.`,
  },

  /* presentation */
  "presentation-length": {
    category: "presentation",
    severity: "important",
    impact: 7,
    title: "Cut it down",
    action:
      "Portfolio review takes minutes. Lead with your six strongest pieces and keep the rest for the interview.",
  },
  "presentation-empty": {
    category: "presentation",
    severity: "polish",
    impact: 3,
    title: "Remove the empty pages",
    action: "A page with nothing the file exposes as text or image reads as an export mistake.",
  },
  "presentation-consistent": {
    category: "presentation",
    severity: "polish",
    impact: 3,
    title: "Use one page size throughout",
    action: "Mixed sizes read as pages assembled from separate exports.",
  },
  "presentation-orientation": {
    category: "presentation",
    severity: "polish",
    impact: 2,
    title: "Pick one orientation",
    action: "Making the reader rotate the document part-way through costs you goodwill.",
  },

  /* deliverability */
  "delivery-size": {
    category: "deliverability",
    severity: "critical",
    impact: 12,
    title: "Get the file under 10 MB",
    action:
      "Most corporate mail servers silently reject bigger attachments. Export images at 150 dpi, or host it and send a link.",
  },
  "delivery-links": {
    category: "deliverability",
    severity: "important",
    impact: 5,
    title: "Add real hyperlinks",
    action: "Insert links rather than typing URLs, so a reader on screen can click through.",
  },
  "delivery-broken": {
    category: "deliverability",
    severity: "critical",
    impact: 8,
    title: "Fix the dead links",
    action:
      "A document circulates for years after you send it. These probably worked the day you exported it.",
  },

  /* job match */
  "jobmatch-required": {
    category: "jobmatch",
    severity: "critical",
    impact: 10,
    warnTitle: "Close the gap on a few required skills",
    title: "Close the gap on required skills",
    action:
      "Only add what you genuinely have — if you have real experience with one of these under different wording, use the posting's exact term instead of your own.",
  },
  "jobmatch-preferred": {
    category: "jobmatch",
    severity: "polish",
    impact: 3,
    title: "Cover the preferred skills too",
    action:
      "These are not required, but naming them where they are genuinely true strengthens the match.",
  },
  "jobmatch-empty": {
    category: "jobmatch",
    severity: "important",
    impact: 2,
    title: "Paste the full job posting",
    action: "A truncated paste cannot be matched against.",
  },

  /* cover letter */
  "coverletter-length": {
    category: "coverletter",
    severity: "important",
    impact: 4,
    title: "Bring the length into range",
    action: "Aim for 200-450 words — enough to say something specific, short enough to be read in full.",
  },
  "coverletter-greeting": {
    category: "coverletter",
    severity: "important",
    impact: 4,
    title: "Address it to a person",
    action:
      "Check the posting, the company site, or LinkedIn for the hiring manager's name before falling back to a generic greeting.",
  },
  "coverletter-cliches": {
    category: "coverletter",
    severity: "polish",
    impact: 3,
    warnTitle: "Cut a couple of stock phrases",
    title: "Cut the stock phrases",
    action: "Replace each with a specific detail from your own experience instead.",
  },
  "coverletter-closing": {
    category: "coverletter",
    severity: "polish",
    impact: 2,
    title: "Close with a next step",
    action: "End by inviting an interview or a call rather than trailing off.",
  },
  "coverletter-role": {
    category: "coverletter",
    severity: "important",
    impact: 3,
    title: "Name the role you're applying for",
    action: "Work the posting's own title into the letter so it reads as written for this application.",
  },
  "coverletter-company": {
    category: "coverletter",
    severity: "critical",
    impact: 6,
    title: "Name the company",
    action: "A letter with no company name anywhere is the clearest sign of an unedited template.",
  },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, important: 1, polish: 2 };

export function generateDocumentSuggestions(
  checkGroups: Check[][],
  profile: DisciplineProfile,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const check of checkGroups.flat()) {
    if (check.status === "pass") continue;
    const rule = RULES[check.id];
    if (!rule) continue;

    const action = typeof rule.action === "function" ? rule.action(profile) : rule.action;

    suggestions.push({
      id: check.id,
      category: rule.category,
      severity:
        check.status === "warn" && rule.severity === "critical" ? "important" : rule.severity,
      title: check.status === "warn" ? (rule.warnTitle ?? rule.title) : rule.title,
      detail: `${check.detail} ${action}`,
      impact: check.status === "fail" ? rule.impact : Math.max(1, Math.round(rule.impact / 2)),
    });
  }

  return suggestions.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : b.impact - a.impact;
  });
}
