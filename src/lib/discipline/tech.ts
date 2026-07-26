import type { SkillDefinition } from "./types";

/**
 * The technology taxonomy.
 *
 * This lives in the discipline layer rather than in the website analyzer because an
 * uploaded resume needs exactly the same matching, and because it is no longer the
 * whole vocabulary — it is one field's worth, composed alongside the others.
 *
 * Single-letter and ambiguous names ("C", "R", "Go", "Express", "Swift") are either
 * omitted or given strict patterns. Matching them in prose invents skills the author
 * never claimed, and then advises them to list more of a stack they do not have.
 */
export const TECH_SKILLS: SkillDefinition[] = [
  // languages
  { name: "JavaScript", category: "languages", patterns: ["javascript", "\\bjs\\b(?! ?doc)"] },
  { name: "TypeScript", category: "languages", patterns: ["typescript"], declaredOnly: ["\\bts\\b"] },
  { name: "Python", category: "languages", patterns: ["python"] },
  { name: "Java", category: "languages", patterns: ["\\bjava\\b(?!script)"] },
  { name: "C#", category: "languages", patterns: ["c#", "c sharp", "csharp"] },
  { name: "C++", category: "languages", patterns: ["c\\+\\+", "cplusplus"] },
  { name: "Go", category: "languages", patterns: ["\\bgolang\\b", "\\bgo\\b(?= ?(lang|programming))"] },
  {
    name: "Rust",
    category: "languages",
    patterns: ["rustlang", "rust lang", "\\brust\\b(?=\\s*\\()"],
    declaredOnly: ["\\brust\\b"],
  },
  { name: "PHP", category: "languages", patterns: ["\\bphp\\b"] },
  { name: "Ruby", category: "languages", patterns: ["ruby on rails"], declaredOnly: ["\\bruby\\b"] },
  {
    name: "Swift",
    category: "languages",
    patterns: ["swiftui", "swift ui", "swift package"],
    declaredOnly: ["\\bswift\\b"],
  },
  { name: "Kotlin", category: "languages", patterns: ["kotlin"] },
  {
    name: "Dart",
    category: "languages",
    patterns: ["dartlang", "dart & flutter", "dart/flutter"],
    declaredOnly: ["\\bdart\\b"],
  },
  { name: "SQL", category: "languages", patterns: ["\\bsql\\b"] },
  { name: "Bash", category: "languages", patterns: ["\\bbash\\b", "shell scripting"] },

  // frontend
  // "built with React" must count, but "react to feedback" must not.
  { name: "React", category: "frontend", patterns: ["react\\.?js", "\\breact\\b(?!ive|\\s+to\\b)"] },
  { name: "Next.js", category: "frontend", patterns: ["next\\.?js"] },
  { name: "Vue", category: "frontend", patterns: ["vue\\.?js", "\\bvue\\b"] },
  { name: "Nuxt", category: "frontend", patterns: ["nuxt"] },
  { name: "Angular", category: "frontend", patterns: ["angular"] },
  { name: "Svelte", category: "frontend", patterns: ["svelte"] },
  { name: "HTML", category: "frontend", patterns: ["\\bhtml5?\\b"] },
  { name: "CSS", category: "frontend", patterns: ["\\bcss3?\\b"] },
  { name: "Sass", category: "frontend", patterns: ["\\bscss\\b", "sass/scss"], declaredOnly: ["\\bsass\\b"] },
  { name: "Tailwind CSS", category: "frontend", patterns: ["tailwind"] },
  { name: "Bootstrap", category: "frontend", patterns: ["bootstrap"] },
  { name: "Redux", category: "frontend", patterns: ["redux"] },
  { name: "jQuery", category: "frontend", patterns: ["jquery"] },
  { name: "Astro", category: "frontend", patterns: ["astro\\.build", "astrojs"], declaredOnly: ["\\bastro\\b"] },
  { name: "Three.js", category: "frontend", patterns: ["three\\.?js"] },
  { name: "Framer Motion", category: "frontend", patterns: ["framer motion"] },

  // backend
  { name: "Node.js", category: "backend", patterns: ["node\\.?js", "nodejs"], declaredOnly: ["\\bnode\\b"] },
  { name: "Express", category: "backend", patterns: ["express\\.?js", "expressjs"], declaredOnly: ["\\bexpress\\b"] },
  { name: "NestJS", category: "backend", patterns: ["nest\\.?js"] },
  { name: "Django", category: "backend", patterns: ["django"] },
  {
    name: "Flask",
    category: "backend",
    patterns: ["flask api", "flask app", "python flask"],
    declaredOnly: ["\\bflask\\b"],
  },
  { name: "FastAPI", category: "backend", patterns: ["fastapi"] },
  {
    name: "Spring",
    category: "backend",
    patterns: ["spring boot", "springboot", "spring framework", "spring mvc"],
    declaredOnly: ["\\bspring\\b"],
  },
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
  {
    name: "Expo",
    category: "mobile",
    patterns: ["expo go", "expo sdk", "expo router"],
    declaredOnly: ["\\bexpo\\b"],
  },

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
  { name: "Machine Learning", category: "data", patterns: ["machine learning"], declaredOnly: ["\\bml\\b"] },
  { name: "Data Analysis", category: "data", patterns: ["data analysis", "data analytics"] },
  { name: "Power BI", category: "data", patterns: ["power bi"] },
  { name: "Tableau", category: "data", patterns: ["tableau"] },
  { name: "LLMs / AI", category: "data", patterns: ["\\bllm", "openai", "\\bgpt-?4", "anthropic", "\\bclaude\\b"] },

  // testing
  {
    name: "Jest",
    category: "testing",
    patterns: ["jestjs", "jest\\.config", "jest snapshot"],
    declaredOnly: ["\\bjest\\b"],
  },
  { name: "Vitest", category: "testing", patterns: ["vitest"] },
  { name: "Cypress", category: "testing", patterns: ["cypress"] },
  { name: "Playwright", category: "testing", patterns: ["playwright"] },
  { name: "Selenium", category: "testing", patterns: ["selenium"] },
  { name: "Testing Library", category: "testing", patterns: ["testing library", "rtl\\b"] },
  { name: "Unit Testing", category: "testing", patterns: ["unit test"] },

  // tools
  { name: "Webpack", category: "tools", patterns: ["webpack"] },
  { name: "Vite", category: "tools", patterns: ["vitejs", "vite\\.config"], declaredOnly: ["\\bvite\\b"] },
  { name: "Jira", category: "tools", patterns: ["\\bjira\\b"] },
  { name: "Agile / Scrum", category: "tools", patterns: ["\\bagile\\b", "\\bscrum\\b"] },
  { name: "Storybook", category: "tools", patterns: ["storybook"] },
  { name: "Postman", category: "tools", patterns: ["postman"] },
  { name: "WordPress", category: "tools", patterns: ["wordpress"] },
  { name: "Shopify", category: "tools", patterns: ["shopify"] },
];

