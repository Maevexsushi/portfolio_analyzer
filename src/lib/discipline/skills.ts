import type { Check, SkillCategory, SkillFinding } from "@/lib/types";
import { COMMON_SKILLS } from "./profiles";
import { TECH_SKILLS } from "./tech";
import type { DisciplineProfile, SkillDefinition } from "./types";

/**
 * Skill matching, shared by every input the tool accepts.
 *
 * One implementation reads a website's markup, an uploaded PDF, and a Word document,
 * because the question is identical in all three: which of this field's skills does the
 * author actually evidence, and did they say so deliberately or did we merely infer it?
 *
 * The declared/inferred split is the part worth preserving. "Express" inside a skills
 * list is a framework; "express myself" in an About paragraph is not, and a report that
 * conflates them credits people with things they never claimed and then advises them
 * about a stack they do not have.
 */

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  languages: "Languages",
  frontend: "Frontend",
  backend: "Backend",
  database: "Databases",
  devops: "DevOps & Cloud",
  mobile: "Mobile",
  design: "Design",
  data: "Data & AI",
  testing: "Testing",
  tools: "Tools & Software",
  craft: "Core craft",
  strategy: "Strategy",
  communication: "Communication",
  research: "Research",
  domain: "Qualifications & domain",
  operations: "Delivery & operations",
};

/**
 * The vocabulary in play for one profile: this field's terms, the ones that mean
 * something everywhere, and the technology list.
 *
 * Technology is included for every discipline on purpose. Careers are not tidy — a
 * marketer who writes SQL and a nurse who runs the ward's Excel reporting both deserve
 * the credit — and the tech patterns are already tuned hard against prose false
 * positives, so carrying them costs nothing but catches the hybrids.
 *
 * Profile entries are applied last so a field can override a shared definition.
 */
export function composeVocabulary(profile: DisciplineProfile): SkillDefinition[] {
  const byName = new Map<string, SkillDefinition>();
  for (const skill of [...TECH_SKILLS, ...COMMON_SKILLS, ...profile.skills]) {
    byName.set(skill.name, skill);
  }
  return [...byName.values()];
}

/**
 * Names from the vocabulary found in a short snippet — a project's tag list, a resume
 * bullet. Short strings are listings rather than prose, so the ambiguous bare names
 * are in scope here in a way they never are for body copy.
 */
export function detectSkillNames(
  snippet: string,
  vocabulary: SkillDefinition[],
  limit = 8,
): string[] {
  const found: string[] = [];
  for (const definition of vocabulary) {
    const patterns = [...definition.patterns, ...(definition.declaredOnly ?? [])];
    if (patterns.some((pattern) => new RegExp(pattern, "i").test(snippet))) {
      found.push(definition.name);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/**
 * @param haystack     all lowercased text, where unambiguous names are trusted
 * @param declaredText the skills-list region, where ambiguous bare names are trusted
 */
export function matchSkills(
  haystack: string,
  declaredText: string,
  vocabulary: SkillDefinition[],
): SkillFinding[] {
  const skills: SkillFinding[] = [];

  for (const definition of vocabulary) {
    let mentions = 0;
    let declared = false;

    for (const pattern of definition.patterns) {
      mentions += (haystack.match(new RegExp(pattern, "gi")) ?? []).length;
      if (!declared && new RegExp(pattern, "i").test(declaredText)) declared = true;
    }

    for (const pattern of definition.declaredOnly ?? []) {
      const inDeclared = (declaredText.match(new RegExp(pattern, "gi")) ?? []).length;
      if (inDeclared > 0) {
        mentions += inDeclared;
        declared = true;
      }
    }

    if (mentions > 0) {
      skills.push({ name: definition.name, category: definition.category, mentions, declared });
    }
  }

  skills.sort((a, b) => {
    if (a.declared !== b.declared) return a.declared ? -1 : 1;
    return b.mentions - a.mentions;
  });

  return skills;
}

export interface SkillsSummary {
  score: number;
  categoriesCovered: SkillCategory[];
  missingCategories: SkillCategory[];
  checks: Check[];
}

/**
 * Turns matched skills into a score against *this field's* expectations.
 *
 * The core categories come from the profile, which is the whole point: a designer with
 * no backend experience is not missing anything, and telling them otherwise is the
 * dev-shaped failure this layer exists to remove.
 */
export function summariseSkills(
  skills: SkillFinding[],
  profile: DisciplineProfile,
  hasSkillsSection: boolean,
): SkillsSummary {
  const covered = [...new Set(skills.map((skill) => skill.category))];
  const missingCore = profile.coreCategories.filter((category) => !covered.includes(category));

  // Breadth up to ~14 skills carries most of the score; past that it is padding.
  const breadthScore = Math.min(45, (skills.length / 14) * 45);
  const coverageScore = Math.min(25, (covered.length / 6) * 25);
  const declaredCount = skills.filter((skill) => skill.declared).length;
  const declaredScore = hasSkillsSection ? Math.min(20, 8 + declaredCount * 1.5) : 0;
  const coreScore =
    profile.coreCategories.length === 0
      ? 10
      : ((profile.coreCategories.length - missingCore.length) / profile.coreCategories.length) * 10;

  const checks: Check[] = [
    {
      id: "skills-section",
      label: "Dedicated skills section",
      status: hasSkillsSection ? "pass" : "fail",
      detail: hasSkillsSection
        ? "Skills are grouped in their own section, which is what recruiters scan for first."
        : "No skills section found — skills are only inferred from body copy.",
    },
    {
      id: "skills-count",
      label: "Skill breadth",
      status: skills.length >= 10 ? "pass" : skills.length >= 5 ? "warn" : "fail",
      detail: `${skills.length} distinct skill${skills.length === 1 ? "" : "s"} detected${
        skills.length < 10 ? " — aim for 10 or more across several groups." : "."
      }`,
    },
    {
      id: "skills-coverage",
      label: `Coverage for ${profile.label.toLowerCase()}`,
      status: missingCore.length === 0 ? "pass" : missingCore.length <= 2 ? "warn" : "fail",
      detail:
        missingCore.length === 0
          ? `Covers what this field expects: ${profile.coreCategories
              .map((category) => SKILL_CATEGORY_LABELS[category].toLowerCase())
              .join(", ")}.`
          : `Nothing detected for: ${missingCore
              .map((category) => SKILL_CATEGORY_LABELS[category])
              .join(", ")}.`,
    },
  ];

  return {
    score: Math.round(Math.min(100, breadthScore + coverageScore + declaredScore + coreScore)),
    categoriesCovered: covered,
    missingCategories: missingCore,
    checks,
  };
}

/**
 * The region of a document where the author is listing skills rather than writing prose.
 *
 * Finds a skills-ish heading and takes what follows it, stopping at the next heading.
 * Uploaded documents have no markup to key off, so "the next ALL-CAPS or Title-Case
 * line that looks like a heading" is the only boundary available.
 */
const SKILLS_HEADING =
  /^(technical |core |key |professional |relevant )?(skills?|competenc|expertise|proficienc|tech(nical)? stack|technologies|tools?( (&|and) (software|technologies))?|qualifications?)\b/i;

const LIKELY_HEADING = /^[A-Z][A-Za-z &/'-]{2,40}:?$/;

export function skillsRegionFromLines(lines: string[]): string {
  const chunks: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (SKILLS_HEADING.test(line)) {
      capturing = true;
      // A one-line "Skills: React, Figma, SQL" carries its payload on the heading itself.
      const inline = line.replace(SKILLS_HEADING, "").replace(/^[:\s-]+/, "");
      if (inline) chunks.push(inline);
      continue;
    }
    if (!capturing) continue;

    const isAllCaps = line === line.toUpperCase() && /[A-Z]{3}/.test(line) && line.length < 48;
    if (isAllCaps || (LIKELY_HEADING.test(line) && line.split(" ").length <= 4)) {
      capturing = false;
      continue;
    }
    chunks.push(line);
    if (chunks.join(" ").length > 4000) break;
  }

  return chunks.join(" ").toLowerCase();
}
