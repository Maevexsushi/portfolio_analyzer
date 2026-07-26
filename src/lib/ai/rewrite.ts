import type {
  ContactReport,
  ExperienceReport,
  ResumeRewrite,
  ResumeStructureReport,
  RewritePlaceholder,
  RewrittenBullet,
  RewrittenEntry,
  RewrittenSection,
  SkillsReport,
} from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { CLICHES } from "@/lib/document/language";
import { chatJson } from "./groq";

/**
 * The improved draft.
 *
 * Everything else in this project describes problems. This is the only part that tries
 * to fix one, and that makes it the only part that can do real damage: a resume is a
 * document its author will be asked to defend in an interview, so a confident
 * invention here is worse than any wrong score elsewhere in the tool.
 *
 * The commonest finding on a weak resume is that nothing carries a number. A model
 * asked to fix that will write "reduced processing time by 40%", because that is what
 * a good bullet looks like — and the author would be sending a fabricated metric to an
 * employer. So the rule is: rewrite what is on the page, and mark what is missing.
 *
 * The rule is not left to the prompt. `stripInventedNumbers` compares every number in
 * the output against the numbers present in the source and replaces anything new with
 * a placeholder. Prompts are advice; the guard is enforcement, and it is the reason
 * this feature is safe to ship.
 */

const SYSTEM_PROMPT = `You rewrite resumes. You are given the full text of one, plus a report on what is weak about it, and you return an improved draft as JSON.

THE ONE RULE THAT MATTERS: never invent a fact. Not a number, not a percentage, not a currency amount, not a team size, not an employer, not a date, not a job title, not a technology. If the source does not contain it, you do not know it. This is a document the author will be questioned about; a plausible invention is a lie they will have to defend.

Where a fact is missing and the bullet needs one, write a placeholder token in square brackets and say what to measure. Good tokens: [N], [N%], [N staff], [N months], [$N], [N customers]. Every placeholder you use must be listed in the "placeholders" array with a prompt telling the author exactly what to go and find out.

What you SHOULD do:
- Rewrite duty phrasing as action phrasing. "Responsible for managing the rota" becomes "Managed the rota for [N] staff".
- Open every bullet with a strong past-tense verb.
- Convert passive to active.
- Cut stock phrases and replace them with the specific thing the source actually says. These are BANNED outright, including in any summary you write: hard-working, team player, self-starter, go-getter, think outside the box, detail-oriented, results-driven, passionate about, dynamic professional, proven track record, synergy, wear many hats, hit the ground running, excellent communication skills, works well independently and in a team, fast-paced environment, references available on request. A summary that could describe any applicant is worse than no summary.
- Split any bullet carrying two ideas into two bullets.
- Use the standard section headings an applicant tracking system recognises: Summary, Experience, Education, Skills, Certifications, Projects.
- Keep role titles, employers and dates exactly as the source has them. They are facts, not prose.
- Preserve every real achievement in the source. You are re-framing, not summarising: do not drop content.

What you MUST NOT do:
- Add a number that is not in the source.
- Add an employer, role, qualification, tool or date that is not in the source.
- Inflate a claim. "Helped with onboarding" does not become "Led onboarding".
- Write anything you could not point at in the source text.

Reply with JSON only, in exactly this shape:
{
  "headline": string,          // name, and the role they are targeting if the source states one
  "contactLine": string,       // email / phone / location / links, on one line, only what the source has
  "sections": [
    {
      "heading": string,       // an ATS-standard heading
      "body": string,          // prose, for a Summary; "" for sections that use entries
      "entries": [
        {
          "title": string,     // role line, carried over verbatim
          "meta": string,      // employer and dates as written, or ""
          "bullets": [
            { "before": string,   // the original line, or "" if you added structure
              "after": string,    // your rewrite
              "why": string }     // max 12 words: what changed and why
          ]
        }
      ]
    }
  ],
  "placeholders": [ { "token": string, "prompt": string } ],
  "notes": [string]            // 2-4 lines on what you changed overall
}`;

export interface RewriteInput {
  document: ExtractedDocument;
  profile: DisciplineProfile;
  contact: ContactReport;
  structure: ResumeStructureReport;
  experience: ExperienceReport;
  skills: SkillsReport;
}

const MAX_SOURCE_CHARS = 9000;

function buildPrompt(input: RewriteInput): string {
  const { document, profile, experience, structure } = input;
  const weak = experience.entries.flatMap((entry) => entry.weakBullets);
  const missing = structure.sections
    .filter((section) => section.required && !section.found)
    .map((section) => section.label);

  return [
    `The author works in: ${profile.label}. Outcome words that carry weight in this field: ${profile.outcomeTerms.join(", ")}.`,
    "",
    "## What the report found",
    `- ${experience.quantifiedBullets} of ${experience.totalBullets} bullets carry a number (${Math.round(experience.quantificationRate * 100)}%).`,
    `- ${experience.actionVerbBullets} of ${experience.totalBullets} bullets open with a strong verb.`,
    weak.length > 0 ? `- Duty-phrase bullets to rewrite:\n${weak.map((b) => `    "${b}"`).join("\n")}` : "- No duty-phrase bullets flagged.",
    missing.length > 0 ? `- Missing sections: ${missing.join(", ")}.` : "- All expected sections present.",
    "",
    "## The resume, in full",
    document.text.slice(0, MAX_SOURCE_CHARS),
  ].join("\n");
}

/* ------------------------------- the guard ------------------------------------ */

/**
 * Every number the source contains, as bare digit strings.
 *
 * Comparison is on digits alone: the model reformats "1,200" as "1200" and "40 %" as
 * "40%" constantly, and treating those as new inventions would gut a correct rewrite.
 */
export function sourceNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d[\d,._]*/g)) {
    const bare = match[0].replace(/[^\d]/g, "");
    if (bare) found.add(bare);
  }
  return found;
}

const PLACEHOLDER = /\[[^\]]*\]/g;

/**
 * Replace any number in the rewrite that is not in the source.
 *
 * This is the enforcement behind the prompt's central rule. A model that invents "40%"
 * gets "[N%]" instead, and the bullet is marked so the reader can see the guard fired
 * rather than quietly trusting the output.
 *
 * Numbers inside an existing placeholder are left alone — "[N staff]" and "[2 of 3]"
 * are the model doing as it was told, not fabricating.
 */
export function stripInventedNumbers(
  text: string,
  allowed: Set<string>,
): { text: string; redacted: boolean } {
  let redacted = false;

  /*
   * Split on placeholders rather than masking them. An earlier version substituted a
   * numeric index for each one, which the digit scan then read as an invented number
   * and redacted — the guard eating its own scaffolding.
   */
  const cleaned = text
    .split(/(\[[^\]]*\])/g)
    .map((part) => {
      if (part.startsWith("[") && part.endsWith("]")) return part;
      return part.replace(/\d[\d,._]*%?/g, (raw) => {
        const bare = raw.replace(/[^\d]/g, "");
        if (!bare || allowed.has(bare)) return raw;
        redacted = true;
        return raw.endsWith("%") ? "[N%]" : "[N]";
      });
    })
    .join("");

  return { text: cleaned, redacted };
}

/* ------------------------------ normalization --------------------------------- */

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Fields the model filled in with a word instead of leaving empty.
 *
 * Asked for `""` where a section has no role line, it writes "None" or "N/A" about as
 * often as it complies — which rendered a Skills list headed "[None]" with a
 * struck-through "None" under every entry. Treated as the blank it meant.
 */
function blankish(value: unknown, max: number): string {
  const text = str(value, max);
  return /^(none|n\/a|na|null|-|—|n\/a\.)$/i.test(text) ? "" : text;
}

function tokensIn(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])];
}

/**
 * Coerce the model's response into the stored type, running the guard over every line
 * of prose on the way through. Exported for the tests: this is the boundary where an
 * unpredictable response becomes a document someone may send to an employer.
 */
export function normalizeRewrite(
  raw: Record<string, unknown>,
  source: string,
  model: string,
  generatedAt: string,
): ResumeRewrite {
  const allowed = sourceNumbers(source);
  let redactedCount = 0;

  const guard = (value: unknown, max: number): { text: string; redacted: boolean } => {
    const cleaned = stripInventedNumbers(str(value, max), allowed);
    if (cleaned.redacted) redactedCount++;
    return cleaned;
  };

  const sections: RewrittenSection[] = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((rawSection): RewrittenSection => {
      const record = (rawSection ?? {}) as Record<string, unknown>;
      const entries: RewrittenEntry[] = (Array.isArray(record.entries) ? record.entries : [])
        .map((rawEntry): RewrittenEntry => {
          const entry = (rawEntry ?? {}) as Record<string, unknown>;
          const bullets: RewrittenBullet[] = (Array.isArray(entry.bullets) ? entry.bullets : [])
            .map((rawBullet): RewrittenBullet => {
              const bullet = (rawBullet ?? {}) as Record<string, unknown>;
              const after = guard(bullet.after, 400);
              return {
                before: blankish(bullet.before, 400) || null,
                after: after.text,
                why: str(bullet.why, 120),
                placeholders: tokensIn(after.text),
                redacted: after.redacted,
              };
            })
            .filter((bullet) => bullet.after.length > 0)
            .slice(0, 12);

          return {
            // Titles and dates are facts carried over, so they are not guarded — a
            // year in a role line is the source's own, not a claim the model made.
            title: blankish(entry.title, 160),
            meta: blankish(entry.meta, 160) || null,
            bullets,
          };
        })
        .filter((entry) => entry.title.length > 0 || entry.bullets.length > 0)
        .slice(0, 12);

      const body = guard(blankish(record.body, 1200), 1200);
      return {
        heading: str(record.heading, 60),
        body: body.text || null,
        entries,
      };
    })
    .filter((section) => section.heading.length > 0 && (section.body || section.entries.length > 0))
    .slice(0, 10);

  const placeholders: RewritePlaceholder[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.placeholders) ? raw.placeholders : []) {
    const record = (item ?? {}) as Record<string, unknown>;
    const token = str(record.token, 40);
    const prompt = str(record.prompt, 200);
    if (!token || !prompt || seen.has(token)) continue;
    seen.add(token);
    placeholders.push({ token, prompt });
  }

  /*
   * A token the guard introduced has no entry from the model, because the model did
   * not mean to leave a gap there. Those still need a prompt, or the author sees a
   * "[N]" in their draft with nothing telling them what it wants.
   */
  const used = new Set(
    sections.flatMap((section) => section.entries.flatMap((e) => e.bullets.flatMap((b) => b.placeholders))),
  );
  for (const token of used) {
    if (seen.has(token)) continue;
    seen.add(token);
    placeholders.push({
      token,
      prompt: "A number was removed here because it was not in your original resume. Fill in the real figure.",
    });
  }

  const rewrite: ResumeRewrite = {
    model,
    generatedAt,
    headline: str(raw.headline, 160),
    contactLine: str(raw.contactLine, 240),
    sections,
    placeholders,
    notes: (Array.isArray(raw.notes) ? raw.notes : [])
      .map((note) => str(note, 240))
      .filter(Boolean)
      .slice(0, 6),
    redactedCount,
    stockPhrases: [],
  };

  rewrite.stockPhrases = findStockPhrases(rewrite);
  return rewrite;
}

/**
 * Stock phrases that survived the rewrite.
 *
 * Found in testing: asked to write the summary the resume was missing, the model
 * produced "detail-oriented operations professional with a proven track record" —
 * two of the exact phrases this tool tells people to delete, in a section it had just
 * invented. Left alone, the draft would hand back the cliché the report flagged one
 * tab over.
 *
 * The same discipline as the number guard applies, with one difference: a fabricated
 * figure can be replaced with a placeholder, but prose cannot be rewritten safely
 * after the fact. So these are detected and named rather than silently patched, and
 * the panel shows the author exactly which lines to redo.
 */
export function findStockPhrases(rewrite: ResumeRewrite): string[] {
  const haystack = [
    rewrite.headline,
    ...rewrite.sections.flatMap((section) => [
      section.body ?? "",
      ...section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.after)),
    ]),
  ].join("\n");

  const hits: string[] = [];
  for (const pattern of CLICHES) {
    const match = new RegExp(pattern, "i").exec(haystack);
    if (match) hits.push(match[0].toLowerCase());
  }
  return hits;
}

/** True when the model gave back nothing worth showing. */
export function isEmptyRewrite(rewrite: ResumeRewrite): boolean {
  return rewrite.sections.length === 0;
}

/** Plain text of the draft, for the copy button and the PDF. */
export function rewriteToText(rewrite: ResumeRewrite): string {
  const lines: string[] = [rewrite.headline, rewrite.contactLine, ""];

  for (const section of rewrite.sections) {
    lines.push(section.heading.toUpperCase(), "");
    if (section.body) lines.push(section.body, "");
    for (const entry of section.entries) {
      lines.push(entry.meta ? `${entry.title} — ${entry.meta}` : entry.title);
      for (const bullet of entry.bullets) lines.push(`- ${bullet.after}`);
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function rewriteResume(input: RewriteInput): Promise<ResumeRewrite> {
  const { json, model } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildPrompt(input),
    // A whole resume of structured output needs far more room than a review.
    maxTokens: 6000,
    temperature: 0.2,
  });

  return normalizeRewrite(json, input.document.text, model, new Date().toISOString());
}
