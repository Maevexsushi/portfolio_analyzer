import type { PageContext } from "./context";
import type { Element } from "domhandler";
import { collapse, selectorHints, textOf } from "./context";
import type { SkillsReport } from "@/lib/types";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { profileFor } from "@/lib/discipline/profiles";
import {
  composeVocabulary,
  detectSkillNames as detectFromVocabulary,
  matchSkills,
  summariseSkills,
} from "@/lib/discipline/skills";

export { SKILL_CATEGORY_LABELS } from "@/lib/discipline/skills";

/**
 * Skills Detector for websites.
 *
 * The matching itself now lives in the discipline layer, shared with uploaded
 * documents. What stays here is the part that is genuinely about HTML: working out
 * which region of the page is a skills list, so ambiguous bare names can be trusted
 * there and nowhere else.
 */

const SKILLS_SECTION_SELECTOR =
  "[id*='skill' i], [class*='skill' i], [id*='stack' i], [class*='stack' i], " +
  "[id*='tech' i], [class*='tech' i], [id*='tool' i], [class*='tool' i], " +
  "[id*='expertise' i], [class*='expertise' i], [id*='service' i], [class*='service' i]";

/** Text limited to the skills area of the page, used to mark a skill as explicitly declared. */
function skillsSectionText(ctx: PageContext): string {
  const { $ } = ctx;
  const chunks: string[] = [];

  // textOf, not .text(): a list of skill chips carries no whitespace between the
  // items, and "TSExpressSpring" matches none of the word-boundary patterns.
  $(SKILLS_SECTION_SELECTOR).each((_, el) => {
    const text = textOf($, el as Element);
    if (text && text.length < 4000) chunks.push(text);
  });

  // Also take whatever follows a "Skills" heading, which is how most hand-built
  // portfolios structure it (heading + sibling list, no wrapping identifier).
  $("h1, h2, h3, h4").each((_, el) => {
    const heading = collapse($(el).text()).toLowerCase();
    if (/skill|stack|technolog|tool|expertise|service|capabilit|competenc/.test(heading)) {
      const parent = $(el).parent()[0] as Element | undefined;
      if (parent) chunks.push(textOf($, parent).slice(0, 4000));
      $(el)
        .nextAll()
        .slice(0, 3)
        .each((__, sibling) => {
          chunks.push(textOf($, sibling as Element).slice(0, 4000));
        });
    }
  });

  return chunks.join(" ").toLowerCase();
}

/**
 * Skill names in an arbitrary snippet — used for a project card's tech tags.
 *
 * Kept as a thin wrapper over the shared detector so the tests that pin the ambiguous
 * cases ("in jest", "rust-red") keep their existing entry point. Defaults to the full
 * cross-discipline vocabulary, since a project's tag list can hold anything.
 */
export function detectSkillNames(snippet: string, limit = 8, profile?: DisciplineProfile): string[] {
  return detectFromVocabulary(snippet, composeVocabulary(profile ?? profileFor("general")), limit);
}

export function analyzeSkills(ctx: PageContext, profile: DisciplineProfile): SkillsReport {
  const declaredText = skillsSectionText(ctx);
  const hasSkillsSection = declaredText.trim().length > 0;

  const skills = matchSkills(ctx.lowerText, declaredText, composeVocabulary(profile));
  const summary = summariseSkills(skills, profile, hasSkillsSection);

  return {
    score: summary.score,
    total: skills.length,
    skills,
    categoriesCovered: summary.categoriesCovered,
    missingCategories: summary.missingCategories,
    hasSkillsSection,
    checks: summary.checks,
  };
}

/** Kept for the selector-hint helper's only other consumer. */
export { selectorHints };
