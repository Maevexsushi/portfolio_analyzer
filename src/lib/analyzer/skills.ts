import type { PageContext } from "./context";
import { collapse, selectorHints } from "./context";
import type { Check, SkillCategory, SkillFinding, SkillsReport } from "@/lib/types";

/**
 * Skills Detector.
 *
 * Matches page copy against a technology taxonomy. Single-letter and ambiguous names
 * ("C", "R", "Go") are either omitted or given strict patterns — a portfolio that says
 * "go to my projects" should not register Go as a skill.
 */

interface SkillDefinition {
  name: string;
  category: SkillCategory;
  patterns: string[];
}

const TAXONOMY: SkillDefinition[] = [
  // languages
  { name: "JavaScript", category: "languages", patterns: ["javascript", "\\bjs\\b(?! ?doc)"] },
  { name: "TypeScript", category: "languages", patterns: ["typescript", "\\bts\\b"] },
  { name: "Python", category: "languages", patterns: ["python"] },
  { name: "Java", category: "languages", patterns: ["\\bjava\\b(?!script)"] },
  { name: "C#", category: "languages", patterns: ["c#", "c sharp", "csharp"] },
  { name: "C++", category: "languages", patterns: ["c\\+\\+", "cplusplus"] },
  { name: "Go", category: "languages", patterns: ["\\bgolang\\b", "\\bgo\\b(?= ?(lang|programming))"] },
  { name: "Rust", category: "languages", patterns: ["\\brust\\b"] },
  { name: "PHP", category: "languages", patterns: ["\\bphp\\b"] },
  { name: "Ruby", category: "languages", patterns: ["\\bruby\\b"] },
  { name: "Swift", category: "languages", patterns: ["\\bswift\\b"] },
  { name: "Kotlin", category: "languages", patterns: ["kotlin"] },
  { name: "Dart", category: "languages", patterns: ["\\bdart\\b"] },
  { name: "SQL", category: "languages", patterns: ["\\bsql\\b"] },
  { name: "Bash", category: "languages", patterns: ["\\bbash\\b", "shell scripting"] },

  // frontend
  { name: "React", category: "frontend", patterns: ["\\breact\\b(?!ive)"] },
  { name: "Next.js", category: "frontend", patterns: ["next\\.?js"] },
  { name: "Vue", category: "frontend", patterns: ["vue\\.?js", "\\bvue\\b"] },
  { name: "Nuxt", category: "frontend", patterns: ["nuxt"] },
  { name: "Angular", category: "frontend", patterns: ["angular"] },
  { name: "Svelte", category: "frontend", patterns: ["svelte"] },
  { name: "HTML", category: "frontend", patterns: ["\\bhtml5?\\b"] },
  { name: "CSS", category: "frontend", patterns: ["\\bcss3?\\b"] },
  { name: "Sass", category: "frontend", patterns: ["\\bsass\\b", "\\bscss\\b"] },
  { name: "Tailwind CSS", category: "frontend", patterns: ["tailwind"] },
  { name: "Bootstrap", category: "frontend", patterns: ["bootstrap"] },
  { name: "Redux", category: "frontend", patterns: ["redux"] },
  { name: "jQuery", category: "frontend", patterns: ["jquery"] },
  { name: "Astro", category: "frontend", patterns: ["\\bastro\\b"] },
  { name: "Three.js", category: "frontend", patterns: ["three\\.?js"] },
  { name: "Framer Motion", category: "frontend", patterns: ["framer motion"] },

  // backend
  { name: "Node.js", category: "backend", patterns: ["node\\.?js", "\\bnode\\b"] },
  { name: "Express", category: "backend", patterns: ["express\\.?js", "\\bexpress\\b"] },
  { name: "NestJS", category: "backend", patterns: ["nest\\.?js"] },
  { name: "Django", category: "backend", patterns: ["django"] },
  { name: "Flask", category: "backend", patterns: ["flask"] },
  { name: "FastAPI", category: "backend", patterns: ["fastapi"] },
  { name: "Spring", category: "backend", patterns: ["spring boot", "\\bspring\\b"] },
  { name: "Laravel", category: "backend", patterns: ["laravel"] },
  { name: "Rails", category: "backend", patterns: ["ruby on rails", "\\brails\\b"] },
  { name: ".NET", category: "backend", patterns: ["\\.net\\b", "asp\\.net", "dotnet"] },
  { name: "GraphQL", category: "backend", patterns: ["graphql"] },
  { name: "REST APIs", category: "backend", patterns: ["rest api", "restful"] },
  { name: "tRPC", category: "backend", patterns: ["trpc"] },

  // database
  { name: "PostgreSQL", category: "database", patterns: ["postgres(ql)?"] },
  { name: "MySQL", category: "database", patterns: ["mysql"] },
  { name: "MongoDB", category: "database", patterns: ["mongo(db)?"] },
  { name: "SQLite", category: "database", patterns: ["sqlite"] },
  { name: "Redis", category: "database", patterns: ["redis"] },
  { name: "Firebase", category: "database", patterns: ["firebase", "firestore"] },
  { name: "Supabase", category: "database", patterns: ["supabase"] },
  { name: "Prisma", category: "database", patterns: ["prisma"] },
  { name: "DynamoDB", category: "database", patterns: ["dynamodb"] },

  // devops
  { name: "Git", category: "devops", patterns: ["\\bgit\\b(?!hub|lab)"] },
  { name: "Docker", category: "devops", patterns: ["docker"] },
  { name: "Kubernetes", category: "devops", patterns: ["kubernetes", "\\bk8s\\b"] },
  { name: "AWS", category: "devops", patterns: ["\\baws\\b", "amazon web services"] },
  { name: "Azure", category: "devops", patterns: ["\\bazure\\b"] },
  { name: "Google Cloud", category: "devops", patterns: ["google cloud", "\\bgcp\\b"] },
  { name: "Vercel", category: "devops", patterns: ["vercel"] },
  { name: "Netlify", category: "devops", patterns: ["netlify"] },
  { name: "CI/CD", category: "devops", patterns: ["ci/cd", "continuous integration"] },
  { name: "GitHub Actions", category: "devops", patterns: ["github actions"] },
  { name: "Terraform", category: "devops", patterns: ["terraform"] },
  { name: "Nginx", category: "devops", patterns: ["nginx"] },
  { name: "Linux", category: "devops", patterns: ["\\blinux\\b", "ubuntu"] },

  // mobile
  { name: "React Native", category: "mobile", patterns: ["react native"] },
  { name: "Flutter", category: "mobile", patterns: ["flutter"] },
  { name: "iOS", category: "mobile", patterns: ["\\bios\\b", "swiftui"] },
  { name: "Android", category: "mobile", patterns: ["android"] },
  { name: "Expo", category: "mobile", patterns: ["\\bexpo\\b"] },

  // design
  { name: "Figma", category: "design", patterns: ["figma"] },
  { name: "Adobe XD", category: "design", patterns: ["adobe xd"] },
  { name: "Photoshop", category: "design", patterns: ["photoshop"] },
  { name: "Illustrator", category: "design", patterns: ["illustrator"] },
  { name: "UI/UX", category: "design", patterns: ["ui/ux", "\\bux\\b", "user experience"] },
  { name: "Responsive Design", category: "design", patterns: ["responsive design", "mobile.first"] },
  { name: "Accessibility", category: "design", patterns: ["accessibility", "\\ba11y\\b", "wcag"] },
  { name: "Blender", category: "design", patterns: ["blender"] },

  // data
  { name: "Pandas", category: "data", patterns: ["pandas"] },
  { name: "NumPy", category: "data", patterns: ["numpy"] },
  { name: "TensorFlow", category: "data", patterns: ["tensorflow"] },
  { name: "PyTorch", category: "data", patterns: ["pytorch"] },
  { name: "Machine Learning", category: "data", patterns: ["machine learning", "\\bml\\b"] },
  { name: "Data Analysis", category: "data", patterns: ["data analysis", "data analytics"] },
  { name: "Power BI", category: "data", patterns: ["power bi"] },
  { name: "Tableau", category: "data", patterns: ["tableau"] },
  { name: "LLMs / AI", category: "data", patterns: ["\\bllm", "openai", "\\bgpt-?4", "anthropic", "\\bclaude\\b"] },

  // testing
  { name: "Jest", category: "testing", patterns: ["\\bjest\\b"] },
  { name: "Vitest", category: "testing", patterns: ["vitest"] },
  { name: "Cypress", category: "testing", patterns: ["cypress"] },
  { name: "Playwright", category: "testing", patterns: ["playwright"] },
  { name: "Selenium", category: "testing", patterns: ["selenium"] },
  { name: "Testing Library", category: "testing", patterns: ["testing library", "rtl\\b"] },
  { name: "Unit Testing", category: "testing", patterns: ["unit test"] },

  // tools
  { name: "Webpack", category: "tools", patterns: ["webpack"] },
  { name: "Vite", category: "tools", patterns: ["\\bvite\\b"] },
  { name: "Jira", category: "tools", patterns: ["\\bjira\\b"] },
  { name: "Agile / Scrum", category: "tools", patterns: ["\\bagile\\b", "\\bscrum\\b"] },
  { name: "Storybook", category: "tools", patterns: ["storybook"] },
  { name: "Postman", category: "tools", patterns: ["postman"] },
  { name: "WordPress", category: "tools", patterns: ["wordpress"] },
  { name: "Shopify", category: "tools", patterns: ["shopify"] },
];

/** Names from the taxonomy found in an arbitrary snippet — used for project tech tags. */
export function detectSkillNames(snippet: string, limit = 8): string[] {
  const found: string[] = [];
  for (const definition of TAXONOMY) {
    if (definition.patterns.some((pattern) => new RegExp(pattern, "i").test(snippet))) {
      found.push(definition.name);
      if (found.length >= limit) break;
    }
  }
  return found;
}

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
  tools: "Tools & Process",
};

/** Categories a hiring manager expects to see covered by a developer portfolio. */
const CORE_CATEGORIES: SkillCategory[] = ["languages", "frontend", "backend", "devops"];

const SKILLS_SECTION_SELECTOR =
  "[id*='skill' i], [class*='skill' i], [id*='stack' i], [class*='stack' i], " +
  "[id*='tech' i], [class*='tech' i], [id*='tool' i], [class*='tool' i]";

/** Text limited to the skills area of the page, used to mark a skill as explicitly declared. */
function skillsSectionText(ctx: PageContext): string {
  const { $ } = ctx;
  const chunks: string[] = [];

  $(SKILLS_SECTION_SELECTOR).each((_, el) => {
    const text = collapse($(el).text());
    if (text && text.length < 4000) chunks.push(text);
  });

  // Also take whatever follows a "Skills" heading, which is how most hand-built
  // portfolios structure it (heading + sibling list, no wrapping identifier).
  ctx.$("h1, h2, h3, h4").each((_, el) => {
    const heading = collapse($(el).text()).toLowerCase();
    if (/skill|stack|technolog|tool|expertise/.test(heading)) {
      chunks.push(collapse($(el).parent().text()).slice(0, 4000));
      chunks.push(collapse($(el).nextAll().slice(0, 3).text()).slice(0, 4000));
    }
  });

  return chunks.join(" ").toLowerCase();
}

export function analyzeSkills(ctx: PageContext): SkillsReport {
  const haystack = ctx.lowerText;
  const declaredText = skillsSectionText(ctx);
  const hasSkillsSection = declaredText.trim().length > 0;

  const skills: SkillFinding[] = [];

  for (const definition of TAXONOMY) {
    let mentions = 0;
    let declared = false;

    for (const pattern of definition.patterns) {
      const regex = new RegExp(pattern, "gi");
      mentions += (haystack.match(regex) ?? []).length;
      if (!declared && new RegExp(pattern, "i").test(declaredText)) declared = true;
    }

    if (mentions > 0) {
      skills.push({ name: definition.name, category: definition.category, mentions, declared });
    }
  }

  skills.sort((a, b) => {
    if (a.declared !== b.declared) return a.declared ? -1 : 1;
    return b.mentions - a.mentions;
  });

  const covered = [...new Set(skills.map((skill) => skill.category))];
  const missingCore = CORE_CATEGORIES.filter((category) => !covered.includes(category));

  // Breadth up to ~14 skills carries most of the score; beyond that it is padding.
  const breadthScore = Math.min(45, (skills.length / 14) * 45);
  const coverageScore = (covered.length / 6) * 25;
  const declaredCount = skills.filter((skill) => skill.declared).length;
  const declaredScore = hasSkillsSection ? Math.min(20, 8 + declaredCount * 1.5) : 0;
  const coreScore = ((CORE_CATEGORIES.length - missingCore.length) / CORE_CATEGORIES.length) * 10;

  const checks: Check[] = [
    {
      id: "skills-section",
      label: "Dedicated skills section",
      status: hasSkillsSection ? "pass" : "fail",
      detail: hasSkillsSection
        ? "Skills are grouped in their own section, which is what recruiters scan for first."
        : "No skills section found — technologies are only inferred from body copy.",
    },
    {
      id: "skills-count",
      label: "Skill breadth",
      status: skills.length >= 10 ? "pass" : skills.length >= 5 ? "warn" : "fail",
      detail: `${skills.length} distinct technolog${skills.length === 1 ? "y" : "ies"} detected${
        skills.length < 10 ? " — aim for 10 or more across several categories." : "."
      }`,
    },
    {
      id: "skills-coverage",
      label: "Category coverage",
      status: missingCore.length === 0 ? "pass" : missingCore.length <= 2 ? "warn" : "fail",
      detail:
        missingCore.length === 0
          ? "Covers languages, frontend, backend, and tooling."
          : `Nothing detected for: ${missingCore
              .map((category) => SKILL_CATEGORY_LABELS[category])
              .join(", ")}.`,
    },
  ];

  return {
    score: Math.round(
      Math.min(100, breadthScore + coverageScore + declaredScore + coreScore),
    ),
    total: skills.length,
    skills,
    categoriesCovered: covered,
    missingCategories: missingCore,
    hasSkillsSection,
    checks,
  };
}
