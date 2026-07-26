import type { DisciplineKey, DisciplineProfile, ProofPlatform, SkillDefinition } from "./types";

/**
 * The profile data.
 *
 * Two rules kept this honest while writing it. Signal terms have to be things people
 * in the field actually type — tool names, deliverable names, certifications — not
 * words an outsider associates with the job. And `expected` platforms are limited to
 * the ones whose absence a reviewer in that field would genuinely notice, because
 * every entry there is a way to cost someone points.
 */

/* ----------------------------- shared vocabulary ------------------------------ */

/**
 * Skills that read as credible in every field. Kept separate so each profile lists
 * only what is distinctive about it, and so adding one here reaches everyone.
 */
export const COMMON_SKILLS: SkillDefinition[] = [
  { name: "Project Management", category: "operations", patterns: ["project management", "project manager"] },
  { name: "Stakeholder Management", category: "communication", patterns: ["stakeholder"] },
  { name: "Public Speaking", category: "communication", patterns: ["public speaking", "conference talk", "keynote"] },
  { name: "Team Leadership", category: "operations", patterns: ["team lead", "line manag", "managed a team", "led a team"] },
  { name: "Mentoring", category: "communication", patterns: ["mentor", "coaching"] },
  { name: "Budgeting", category: "operations", patterns: ["budget"] },
  { name: "Excel", category: "tools", patterns: ["\\bexcel\\b", "spreadsheet", "google sheets"] },
  { name: "PowerPoint / Slides", category: "tools", patterns: ["powerpoint", "google slides", "keynote deck"] },
  { name: "Notion", category: "tools", patterns: ["notion"] },
  { name: "Slack", category: "tools", patterns: ["\\bslack\\b"] },
  { name: "Agile / Scrum", category: "operations", patterns: ["\\bagile\\b", "\\bscrum\\b", "kanban"] },
  { name: "Jira", category: "tools", patterns: ["\\bjira\\b", "\\basana\\b", "trello"] },
  { name: "Cross-functional Collaboration", category: "communication", patterns: ["cross.functional", "cross.team"] },
];

/** Platforms that mean the same thing everywhere. */
const UNIVERSAL_PLATFORMS: ProofPlatform[] = [
  {
    id: "linkedin",
    label: "LinkedIn profile",
    pattern: /linkedin\.com/i,
    weight: "expected",
    note: "Most recruiters check LinkedIn before anything else, whatever the field.",
  },
];

const CONTACT_NOTE = "A reviewer who wants to reach you should not have to work for it.";

/* --------------------------------- profiles ----------------------------------- */

const SOFTWARE: DisciplineProfile = {
  key: "software",
  label: "Software & engineering",
  blurb: "Judged on shipped code, technical depth, and whether the work can be inspected.",
  signals: [
    { pattern: /\bgithub\b|\bgitlab\b|\brepositor(y|ies)\b/i, weight: 5 },
    { pattern: /\bapi\b|\bbackend\b|\bfrontend\b|full.?stack/i, weight: 4 },
    { pattern: /\breact\b|\bpython\b|typescript|kubernetes|\bdocker\b/i, weight: 4 },
    { pattern: /software engineer|developer|programmer|\bdevops\b|\bsre\b/i, weight: 5 },
    { pattern: /\bdeployed\b|\bdatabase\b|microservice|\bci\/cd\b/i, weight: 3 },
    { pattern: /unit test|code review|pull request|\brefactor/i, weight: 3 },
  ],
  skills: [],
  coreCategories: ["languages", "frontend", "backend", "devops"],
  platforms: [
    {
      id: "github",
      label: "Code host (GitHub, GitLab)",
      pattern: /github\.com|gitlab\.com|bitbucket\.org|codeberg\.org/i,
      weight: "expected",
      note: "Reviewers look for readable code before anything else you have written about it.",
    },
    ...UNIVERSAL_PLATFORMS,
    {
      id: "writing",
      label: "Technical writing",
      pattern: /dev\.to|medium\.com|hashnode|substack\.com|\.hashnode\./i,
      weight: "bonus",
      note: "Writing about your work is the cheapest way to show how you think.",
    },
  ],
  workNoun: { singular: "project", plural: "projects" },
  depthExpectations: [
    "what the thing does and who it is for",
    "the stack, and why those choices",
    "a link to the running thing and a link to the source",
    "what was hard about it",
  ],
  outcomeTerms: ["latency", "throughput", "uptime", "users", "reduced", "improved", "scaled", "shipped"],
};

const DESIGN: DisciplineProfile = {
  key: "design",
  label: "Design & UX",
  blurb: "Judged on case studies that show process and outcome, not just finished visuals.",
  /*
   * Two kinds of designer, and an earlier version of this list only described one.
   * Product and UX designers say "wireframe" and "usability test"; brand, editorial,
   * and graphic designers say "identity", "packaging", "typesetting", "grid". Detecting
   * only the first sent every visual designer to the general profile — the exact
   * exclusion this layer exists to remove.
   */
  signals: [
    { pattern: /\bdesigner\b|\bdesign lead\b|\bdesign director\b/i, weight: 5 },
    { pattern: /\bfigma\b|\bsketch app\b|adobe xd|framer|invision|indesign/i, weight: 5 },
    { pattern: /\bux\b|\bui\b|user experience|user interface/i, weight: 4 },
    { pattern: /wireframe|prototyp|design system|style guide|mockup/i, weight: 5 },
    { pattern: /usability test|user research|user journey|persona/i, weight: 4 },
    { pattern: /case study|case studies|selected work/i, weight: 3 },
    { pattern: /\bbranding\b|brand identity|\bidentity\b|\btypograph|\bvisual design\b/i, weight: 4 },
    { pattern: /illustrat|art direct|graphic design/i, weight: 4 },
    { pattern: /\beditorial design|\btypeset|\blayout\b|\bgrid\b|\bpackaging\b|\bsignage\b|wayfinding/i, weight: 4 },
  ],
  skills: [
    { name: "Figma", category: "tools", patterns: ["figma"] },
    { name: "Sketch", category: "tools", patterns: ["sketch app", "sketchapp"], declaredOnly: ["\\bsketch\\b"] },
    { name: "Adobe XD", category: "tools", patterns: ["adobe xd"] },
    { name: "Framer", category: "tools", patterns: ["framer"] },
    { name: "InDesign", category: "tools", patterns: ["indesign"] },
    { name: "After Effects", category: "tools", patterns: ["after effects"] },
    { name: "Wireframing", category: "craft", patterns: ["wireframe"] },
    { name: "Prototyping", category: "craft", patterns: ["prototyp"] },
    { name: "Design Systems", category: "craft", patterns: ["design system", "component library", "style guide"] },
    { name: "Typography", category: "craft", patterns: ["typograph", "typeface", "lettering"] },
    { name: "Brand Identity", category: "craft", patterns: ["brand identity", "\\bbranding\\b", "logo design"] },
    { name: "Illustration", category: "craft", patterns: ["illustrat"] },
    { name: "Motion Design", category: "craft", patterns: ["motion design", "motion graphics"] },
    { name: "Art Direction", category: "craft", patterns: ["art direct"] },
    { name: "Information Architecture", category: "craft", patterns: ["information architecture", "\\bia\\b(?! ?generat)"] },
    { name: "User Research", category: "research", patterns: ["user research", "user interview", "contextual inquiry"] },
    { name: "Usability Testing", category: "research", patterns: ["usability test", "user testing", "\\bua?t\\b"] },
    { name: "Personas & Journeys", category: "research", patterns: ["persona", "user journey", "journey map"] },
    { name: "Accessibility", category: "craft", patterns: ["accessibility", "\\ba11y\\b", "\\bwcag\\b"] },
    { name: "Design Critique", category: "communication", patterns: ["design critique", "\\bcrit\\b"] },
    { name: "Editorial Design", category: "craft", patterns: ["editorial design", "typeset", "\\bgrid system\\b", "magazine design"] },
    { name: "Packaging Design", category: "craft", patterns: ["packaging"] },
    { name: "Signage & Wayfinding", category: "craft", patterns: ["signage", "wayfinding", "environmental graphic"] },
  ],
  coreCategories: ["craft", "research", "tools", "communication"],
  platforms: [
    {
      id: "portfolio-platform",
      label: "Design portfolio (Behance, Dribbble, personal site)",
      pattern: /behance\.net|dribbble\.com|cargo\.site|readymag|semplice|adobe\.com\/portfolio/i,
      weight: "expected",
      note: "Design hiring runs on portfolios. A link to somewhere the work can be seen is the whole application.",
    },
    ...UNIVERSAL_PLATFORMS,
    {
      id: "writing",
      label: "Design writing",
      pattern: /medium\.com|substack\.com|uxdesign\.cc|smashingmagazine/i,
      weight: "bonus",
      note: "Written thinking separates a designer from a portfolio of pictures.",
    },
  ],
  workNoun: { singular: "case study", plural: "case studies" },
  depthExpectations: [
    "the problem and who had it",
    "your role, and what the rest of the team did",
    "the process — what you tried and what you threw away",
    "the outcome, measured if anyone measured it",
  ],
  outcomeTerms: ["conversion", "engagement", "task success", "drop-off", "adoption", "retention", "reduced", "increased"],
};

const DATA: DisciplineProfile = {
  key: "data",
  label: "Data & analytics",
  blurb: "Judged on the question asked, the method, and whether the answer changed a decision.",
  signals: [
    { pattern: /\bsql\b|\bpandas\b|\bnumpy\b|\br studio\b|jupyter/i, weight: 5 },
    { pattern: /data (analys|scien|engineer)|analytics/i, weight: 5 },
    { pattern: /machine learning|regression|classification|clustering/i, weight: 4 },
    { pattern: /\btableau\b|power ?bi|\blooker\b|dashboard/i, weight: 4 },
    { pattern: /\betl\b|data pipeline|data warehouse|\bdbt\b/i, weight: 4 },
    { pattern: /statistical|hypothesis|\ba\/b test/i, weight: 3 },
  ],
  skills: [
    { name: "SQL", category: "languages", patterns: ["\\bsql\\b"] },
    { name: "Python (data)", category: "languages", patterns: ["\\bpandas\\b", "\\bnumpy\\b", "scikit"] },
    { name: "R", category: "languages", patterns: ["\\br studio\\b", "rstudio", "\\bggplot\\b", "tidyverse"] },
    { name: "Tableau", category: "tools", patterns: ["tableau"] },
    { name: "Power BI", category: "tools", patterns: ["power ?bi"] },
    { name: "Looker", category: "tools", patterns: ["\\blooker\\b"] },
    { name: "dbt", category: "tools", patterns: ["\\bdbt\\b"] },
    { name: "Jupyter", category: "tools", patterns: ["jupyter", "\\bcolab\\b"] },
    { name: "Statistics", category: "craft", patterns: ["statistic", "hypothesis test", "confidence interval", "p.value"] },
    { name: "A/B Testing", category: "research", patterns: ["a/b test", "split test", "experiment design"] },
    { name: "Machine Learning", category: "craft", patterns: ["machine learning", "\\bxgboost\\b", "random forest"] },
    { name: "Data Visualisation", category: "craft", patterns: ["data vis", "dataviz", "\\bchart", "dashboard"] },
    { name: "ETL / Pipelines", category: "craft", patterns: ["\\betl\\b", "data pipeline", "airflow"] },
    { name: "Data Modelling", category: "craft", patterns: ["data model", "star schema", "dimensional model"] },
    { name: "Forecasting", category: "craft", patterns: ["forecast", "time series"] },
  ],
  coreCategories: ["craft", "languages", "tools", "research"],
  platforms: [
    {
      id: "github",
      label: "Notebooks or code (GitHub, Kaggle)",
      pattern: /github\.com|gitlab\.com|kaggle\.com|colab\.research/i,
      weight: "expected",
      note: "An analysis nobody can reproduce is an assertion. Link the notebook.",
    },
    ...UNIVERSAL_PLATFORMS,
    {
      id: "writing",
      label: "Analysis write-ups",
      pattern: /medium\.com|substack\.com|towardsdatascience|observablehq/i,
      weight: "bonus",
      note: "The write-up is where you show judgement, which is the part that is hard to hire for.",
    },
  ],
  workNoun: { singular: "analysis", plural: "analyses" },
  depthExpectations: [
    "the question, and who needed it answered",
    "the data and its limits",
    "the method, in enough detail to be argued with",
    "what decision changed as a result",
  ],
  outcomeTerms: ["accuracy", "lift", "reduced", "increased", "saved", "forecast", "significant", "decision"],
};

const PRODUCT: DisciplineProfile = {
  key: "product",
  label: "Product & project management",
  blurb: "Judged on decisions made under uncertainty and the outcomes they produced.",
  signals: [
    { pattern: /product manager|product owner|\bpm\b|programme manager|program manager/i, weight: 5 },
    { pattern: /\broadmap\b|\bbacklog\b|user stor|\bepic\b|\bprd\b/i, weight: 5 },
    { pattern: /stakeholder|prioriti[sz]|discovery|go.to.market/i, weight: 3 },
    { pattern: /\bokr\b|\bkpi\b|north star metric/i, weight: 4 },
    { pattern: /\bscrum\b|\bagile\b|\bsprint\b|\bkanban\b/i, weight: 3 },
    { pattern: /\bpmp\b|prince2|\bcsm\b|safe certified/i, weight: 5 },
  ],
  skills: [
    { name: "Roadmapping", category: "strategy", patterns: ["roadmap"] },
    { name: "Prioritisation", category: "strategy", patterns: ["prioriti[sz]", "\\brice\\b", "moscow"] },
    { name: "Product Discovery", category: "research", patterns: ["discovery", "customer interview", "problem validation"] },
    { name: "User Stories", category: "craft", patterns: ["user stor", "acceptance criteria"] },
    { name: "OKRs & KPIs", category: "strategy", patterns: ["\\bokr\\b", "\\bkpi\\b", "north star"] },
    { name: "Go-to-Market", category: "strategy", patterns: ["go.to.market", "\\bgtm\\b", "product launch"] },
    { name: "Risk Management", category: "operations", patterns: ["risk register", "risk management", "mitigation plan"] },
    { name: "Requirements (PRD)", category: "craft", patterns: ["\\bprd\\b", "requirements doc", "spec document"] },
    { name: "PMP / PRINCE2", category: "domain", patterns: ["\\bpmp\\b", "prince2", "\\bcapm\\b"] },
    { name: "Scrum Master", category: "domain", patterns: ["scrum master", "\\bcsm\\b", "\\bpsm\\b"] },
    { name: "Analytics (Amplitude, Mixpanel)", category: "tools", patterns: ["amplitude", "mixpanel", "\\bpendo\\b", "google analytics"] },
    { name: "Roadmap Tools", category: "tools", patterns: ["productboard", "aha!", "linear\\.app"] },
  ],
  coreCategories: ["strategy", "communication", "operations", "research"],
  platforms: [
    ...UNIVERSAL_PLATFORMS,
    {
      id: "writing",
      label: "Written product thinking",
      pattern: /medium\.com|substack\.com|notion\.site|mindtheproduct/i,
      weight: "bonus",
      note: "Product work is invisible from outside. Writing is how you make the reasoning legible.",
    },
  ],
  workNoun: { singular: "product story", plural: "product stories" },
  depthExpectations: [
    "the problem and the evidence it was real",
    "the options you rejected, and why",
    "what you shipped and what you cut",
    "the metric that moved, and by how much",
  ],
  outcomeTerms: ["retention", "activation", "revenue", "churn", "adoption", "shipped", "increased", "reduced", "launched"],
};

const MARKETING: DisciplineProfile = {
  key: "marketing",
  label: "Marketing & growth",
  blurb: "Judged on campaigns with numbers attached and channels you can actually run.",
  signals: [
    { pattern: /\bseo\b|\bsem\b|\bppc\b|google ads|meta ads/i, weight: 5 },
    { pattern: /campaign|brand awareness|lead gen|conversion rate/i, weight: 4 },
    { pattern: /content marketing|email marketing|social media manager/i, weight: 5 },
    { pattern: /\bctr\b|\bcpa\b|\broas\b|\bcac\b|\bltv\b/i, weight: 5 },
    { pattern: /hubspot|mailchimp|klaviyo|salesforce|marketo/i, weight: 4 },
    { pattern: /growth marketing|performance marketing|demand gen/i, weight: 5 },
  ],
  skills: [
    { name: "SEO", category: "craft", patterns: ["\\bseo\\b", "search engine optimi"] },
    { name: "Paid Search / Social", category: "craft", patterns: ["\\bppc\\b", "google ads", "meta ads", "paid social", "adwords"] },
    { name: "Email Marketing", category: "craft", patterns: ["email marketing", "email campaign", "newsletter"] },
    { name: "Content Marketing", category: "craft", patterns: ["content marketing", "content strategy", "content calendar"] },
    { name: "Social Media", category: "craft", patterns: ["social media", "community management"] },
    { name: "Copywriting", category: "craft", patterns: ["copywrit", "\\bcopy\\b(?! ?(and paste|of))"] },
    { name: "Conversion Optimisation", category: "craft", patterns: ["\\bcro\\b", "conversion rate optimi", "landing page test"] },
    { name: "Marketing Analytics", category: "research", patterns: ["google analytics", "\\bga4\\b", "attribution", "\\broas\\b", "\\bcac\\b"] },
    { name: "HubSpot", category: "tools", patterns: ["hubspot"] },
    { name: "Mailchimp / Klaviyo", category: "tools", patterns: ["mailchimp", "klaviyo"] },
    { name: "Salesforce", category: "tools", patterns: ["salesforce", "\\bcrm\\b"] },
    { name: "Brand Strategy", category: "strategy", patterns: ["brand strategy", "positioning", "messaging framework"] },
    { name: "Influencer & PR", category: "craft", patterns: ["influencer", "public relations", "\\bpr campaign\\b", "press release"] },
  ],
  coreCategories: ["craft", "strategy", "research", "tools"],
  platforms: [
    ...UNIVERSAL_PLATFORMS,
    {
      id: "work-samples",
      label: "Campaign samples or published work",
      pattern: /behance\.net|medium\.com|substack\.com|notion\.site|instagram\.com|tiktok\.com/i,
      weight: "expected",
      note: "Marketing claims need artefacts. Link the campaign, the post, or the page you wrote.",
    },
  ],
  workNoun: { singular: "campaign", plural: "campaigns" },
  depthExpectations: [
    "the audience and the goal",
    "the channels and the spend",
    "what you made — the actual creative or copy",
    "the numbers before and after",
  ],
  outcomeTerms: ["ctr", "conversion", "roas", "impressions", "leads", "revenue", "growth", "increased", "reduced", "%"],
};

const WRITING: DisciplineProfile = {
  key: "writing",
  label: "Writing & content",
  blurb: "Judged on clips a reader can actually read, and range across formats.",
  signals: [
    { pattern: /\bcopywriter\b|content writer|technical writer|journalist/i, weight: 5 },
    { pattern: /\bclips?\b|published (in|by)|bylin/i, weight: 5 },
    { pattern: /editing|proofread|\bsub.?editor\b|style guide/i, weight: 4 },
    { pattern: /\bghostwrit|long.?form|feature writing/i, weight: 4 },
    { pattern: /content design|\bux writ/i, weight: 5 },
    { pattern: /\bcms\b|wordpress|contentful|\bghost\b/i, weight: 2 },
  ],
  skills: [
    { name: "Copywriting", category: "craft", patterns: ["copywrit"] },
    { name: "Long-form Writing", category: "craft", patterns: ["long.?form", "feature writing", "essay"] },
    { name: "Editing", category: "craft", patterns: ["\\bediting\\b", "\\beditor\\b", "proofread", "sub.?edit"] },
    { name: "UX Writing", category: "craft", patterns: ["ux writ", "content design", "microcopy"] },
    { name: "Technical Writing", category: "craft", patterns: ["technical writ", "documentation", "api docs"] },
    { name: "Journalism", category: "craft", patterns: ["journalis", "report(ing|er)\\b", "\\bbyline\\b"] },
    { name: "Scriptwriting", category: "craft", patterns: ["scriptwrit", "screenplay", "\\bscript\\b(?! ?tag)"] },
    { name: "SEO Writing", category: "craft", patterns: ["\\bseo\\b", "keyword research"] },
    { name: "Style Guides", category: "craft", patterns: ["style guide", "tone of voice", "\\bap style\\b", "chicago manual"] },
    { name: "Interviewing", category: "research", patterns: ["interview(ed|ing|s)?\\b"] },
    { name: "Fact-checking", category: "research", patterns: ["fact.check", "\\bsourcing\\b"] },
    { name: "CMS (WordPress, Contentful)", category: "tools", patterns: ["wordpress", "contentful", "\\bghost cms\\b", "\\bcms\\b"] },
  ],
  coreCategories: ["craft", "research", "communication", "tools"],
  platforms: [
    {
      id: "clips",
      label: "Published clips",
      pattern: /medium\.com|substack\.com|wordpress\.com|ghost\.io|contently|muckrack|\.press|journoportfolio/i,
      weight: "expected",
      note: "Editors hire from clips. Somewhere with your published pieces on it is the entire pitch.",
    },
    ...UNIVERSAL_PLATFORMS,
  ],
  workNoun: { singular: "piece", plural: "pieces" },
  depthExpectations: [
    "where it ran and when",
    "who it was written for",
    "what you were solving — a brief, a beat, a product problem",
    "a link a reader can open",
  ],
  outcomeTerms: ["readers", "views", "shares", "published", "ranked", "cited", "syndicated", "increased"],
};

const MEDIA: DisciplineProfile = {
  key: "media",
  label: "Photography, film & visual media",
  blurb: "Judged on a tight edit of the work itself and the credits behind it.",
  signals: [
    { pattern: /photograph|videograph|cinematograph|\bfilmmak/i, weight: 5 },
    { pattern: /lightroom|premiere pro|final cut|davinci resolve|\bcapture one\b/i, weight: 5 },
    { pattern: /\bshoot\b|\bediting suite\b|colour grad|color grad/i, weight: 4 },
    { pattern: /\bportrait\b|\bwedding\b|\bdocumentary\b|\bcommercial\b/i, weight: 2 },
    { pattern: /\bcamera\b|\blens\b|\blighting\b|\bstudio\b/i, weight: 3 },
    { pattern: /motion graphics|animation|\bvfx\b|3d render/i, weight: 4 },
  ],
  skills: [
    { name: "Photography", category: "craft", patterns: ["photograph"] },
    { name: "Videography", category: "craft", patterns: ["videograph", "\\bfilming\\b"] },
    { name: "Cinematography", category: "craft", patterns: ["cinematograph", "\\bdop\\b", "director of photography"] },
    { name: "Video Editing", category: "craft", patterns: ["video edit", "premiere pro", "final cut", "davinci resolve"] },
    { name: "Colour Grading", category: "craft", patterns: ["colou?r grad"] },
    { name: "Lighting", category: "craft", patterns: ["\\blighting\\b", "studio light", "three.point light"] },
    { name: "Retouching", category: "craft", patterns: ["retouch", "\\bcompositing\\b"] },
    { name: "Motion Graphics", category: "craft", patterns: ["motion graphics", "after effects"] },
    { name: "Animation", category: "craft", patterns: ["\\banimation\\b", "\\banimator\\b", "\\brigging\\b"] },
    { name: "3D / VFX", category: "craft", patterns: ["\\bvfx\\b", "\\bblender\\b", "cinema 4d", "\\bmaya\\b", "3d render"] },
    { name: "Lightroom", category: "tools", patterns: ["lightroom"] },
    { name: "Photoshop", category: "tools", patterns: ["photoshop"] },
    { name: "Sound Design", category: "craft", patterns: ["sound design", "audio mix", "\\bfoley\\b"] },
    { name: "Producing", category: "operations", patterns: ["\\bproducer\\b", "\\bproducing\\b", "call sheet", "location scout"] },
  ],
  coreCategories: ["craft", "tools", "operations", "communication"],
  platforms: [
    {
      id: "showreel",
      label: "Reel or gallery",
      pattern: /vimeo\.com|youtube\.com|youtu\.be|behance\.net|instagram\.com|flickr\.com|500px\.com|smugmug|pixieset/i,
      weight: "expected",
      note: "Nobody hires from a description of footage. A reel or gallery link is the work.",
    },
    ...UNIVERSAL_PLATFORMS,
    {
      id: "credits",
      label: "Credits (IMDb)",
      pattern: /imdb\.com/i,
      weight: "bonus",
      note: "Verifiable credits carry weight for anything broadcast or released.",
    },
  ],
  workNoun: { singular: "piece", plural: "work" },
  depthExpectations: [
    "your role on it — shooter, editor, director, all three",
    "the client or the brief",
    "the constraints: crew size, budget, turnaround",
    "somewhere the finished thing can be watched",
  ],
  outcomeTerms: ["views", "screened", "aired", "published", "commissioned", "awarded", "selected"],
};

const BUSINESS: DisciplineProfile = {
  key: "business",
  label: "Business, finance & operations",
  blurb: "Judged on scope owned, numbers moved, and process improved.",
  signals: [
    { pattern: /\baccount(ing|ant)\b|\bbookkeep|\bpayroll\b|\bledger\b/i, weight: 5 },
    { pattern: /\bfinanc(e|ial)\b|\bp&l\b|\bforecast(ing)?\b|\bbudget/i, weight: 4 },
    { pattern: /\bacca\b|\bcima\b|\bcpa\b|\bcfa\b|chartered account/i, weight: 6 },
    { pattern: /supply chain|procurement|logistics|inventory/i, weight: 5 },
    { pattern: /business analys|operations manager|\bhr\b|human resources/i, weight: 4 },
    { pattern: /\bsix sigma\b|\blean\b|process improvement/i, weight: 4 },
    { pattern: /\bsap\b|\bquickbooks\b|\bxero\b|\berp\b|\bnetsuite\b/i, weight: 5 },
  ],
  skills: [
    { name: "Financial Reporting", category: "craft", patterns: ["financial report", "\\bp&l\\b", "balance sheet", "month.end close"] },
    { name: "Forecasting & Budgeting", category: "craft", patterns: ["forecast", "budget", "variance analysis"] },
    { name: "Bookkeeping", category: "craft", patterns: ["bookkeep", "\\bledger\\b", "reconcil"] },
    { name: "Payroll", category: "craft", patterns: ["payroll"] },
    { name: "Audit & Compliance", category: "domain", patterns: ["\\baudit", "compliance", "\\bsox\\b", "\\bifrs\\b", "\\bgaap\\b"] },
    { name: "ACCA / CPA / CFA", category: "domain", patterns: ["\\bacca\\b", "\\bcima\\b", "\\bcpa\\b", "\\bcfa\\b", "chartered account"] },
    { name: "Procurement", category: "operations", patterns: ["procurement", "sourcing", "vendor management", "supplier"] },
    { name: "Supply Chain", category: "operations", patterns: ["supply chain", "logistics", "inventory", "warehouse"] },
    { name: "Process Improvement", category: "operations", patterns: ["process improvement", "six sigma", "\\blean\\b", "\\bkaizen\\b"] },
    { name: "Business Analysis", category: "research", patterns: ["business analys", "requirements gathering", "\\bas.is\\b", "gap analysis"] },
    { name: "SAP / ERP", category: "tools", patterns: ["\\bsap\\b", "\\berp\\b", "netsuite", "oracle financ"] },
    { name: "QuickBooks / Xero", category: "tools", patterns: ["quickbooks", "\\bxero\\b", "\\bsage\\b"] },
    { name: "HR & Recruitment", category: "domain", patterns: ["human resources", "\\bhr\\b", "recruit", "onboarding process"] },
  ],
  coreCategories: ["craft", "domain", "operations", "tools"],
  platforms: [...UNIVERSAL_PLATFORMS],
  workNoun: { singular: "engagement", plural: "engagements" },
  depthExpectations: [
    "the scope you owned — budget, headcount, region",
    "the state of things when you arrived",
    "what you changed",
    "the number that moved, with its unit",
  ],
  outcomeTerms: ["saved", "reduced", "revenue", "margin", "cost", "%", "efficiency", "turnaround", "compliance"],
};

const EDUCATION: DisciplineProfile = {
  key: "education",
  label: "Education & research",
  blurb: "Judged on teaching practice, curriculum built, and work published.",
  signals: [
    { pattern: /\bteacher\b|\blecturer\b|\bprofessor\b|\btutor\b|\beducator\b/i, weight: 5 },
    { pattern: /curriculum|lesson plan|\bpedagog|syllabus/i, weight: 5 },
    { pattern: /\bphd\b|\bmsc\b|\bma\b|dissertation|thesis/i, weight: 3 },
    { pattern: /peer.review|\bpublication|\bcitation|journal article/i, weight: 5 },
    { pattern: /\bqts\b|\bpgce\b|\btefl\b|\bcelta\b|teaching licen[cs]e/i, weight: 6 },
    { pattern: /\bofsted\b|safeguarding|\bsen\b|special educational needs/i, weight: 5 },
  ],
  skills: [
    { name: "Curriculum Design", category: "craft", patterns: ["curriculum", "syllabus", "scheme of work"] },
    { name: "Lesson Planning", category: "craft", patterns: ["lesson plan", "learning objective"] },
    { name: "Classroom Management", category: "craft", patterns: ["classroom management", "behaviour management"] },
    { name: "Assessment", category: "craft", patterns: ["assessment", "\\bmarking\\b", "\\bgrading\\b", "formative", "summative"] },
    { name: "Differentiation & SEN", category: "domain", patterns: ["differentiat", "\\bsen\\b", "\\biep\\b", "special educational needs", "inclusive teaching"] },
    { name: "Safeguarding", category: "domain", patterns: ["safeguarding", "child protection", "\\bdbs\\b"] },
    { name: "QTS / PGCE / TEFL", category: "domain", patterns: ["\\bqts\\b", "\\bpgce\\b", "\\btefl\\b", "\\bcelta\\b"] },
    { name: "Research & Publication", category: "research", patterns: ["peer.review", "publication", "journal article", "conference paper"] },
    { name: "Qualitative Methods", category: "research", patterns: ["qualitative", "ethnograph", "thematic analysis"] },
    { name: "Quantitative Methods", category: "research", patterns: ["quantitative", "\\bspss\\b", "statistical analysis"] },
    { name: "Grant Writing", category: "communication", patterns: ["grant", "funding bid", "research council"] },
    { name: "VLE (Moodle, Canvas)", category: "tools", patterns: ["moodle", "\\bcanvas lms\\b", "blackboard", "google classroom"] },
  ],
  coreCategories: ["craft", "domain", "research", "communication"],
  platforms: [
    ...UNIVERSAL_PLATFORMS,
    {
      id: "scholar",
      label: "Publications (Google Scholar, ORCID)",
      pattern: /scholar\.google|orcid\.org|researchgate|academia\.edu|doi\.org/i,
      weight: "bonus",
      note: "For anything research-facing, a citable profile does more than a list of titles.",
    },
  ],
  workNoun: { singular: "programme", plural: "programmes" },
  depthExpectations: [
    "who you taught — age, level, cohort size",
    "what you built rather than delivered",
    "how you know it worked",
    "the outcome: attainment, progression, publication",
  ],
  outcomeTerms: ["attainment", "progression", "grades", "pass rate", "published", "cited", "improved", "%"],
};

const CARE: DisciplineProfile = {
  key: "care",
  label: "Healthcare & social care",
  blurb: "Judged on registration, clinical setting, and evidence of safe practice.",
  signals: [
    { pattern: /\bnurse\b|\bnursing\b|\brgn\b|\bhca\b|health care assistant/i, weight: 6 },
    { pattern: /\bpatient\b|\bclinical\b|\bward\b|\bicu\b|\ba&e\b|emergency department/i, weight: 5 },
    { pattern: /\bnmc\b|\bhcpc\b|\bgmc\b|\bpin\b number|registration number/i, weight: 6 },
    { pattern: /care plan|safeguarding|medication administration|\bcqc\b/i, weight: 5 },
    { pattern: /\bphysiotherap|\bpharmac|\bradiograph|\bmidwif|paramedic/i, weight: 6 },
    { pattern: /social work|\bswe\b|mental health|support worker/i, weight: 5 },
  ],
  skills: [
    { name: "Patient Care", category: "craft", patterns: ["patient care", "person.cent(re|er)ed", "bedside"] },
    { name: "Care Planning", category: "craft", patterns: ["care plan", "treatment plan"] },
    { name: "Clinical Assessment", category: "craft", patterns: ["clinical assessment", "\\btriage\\b", "\\bobservations\\b", "\\bnews2\\b"] },
    { name: "Medication Administration", category: "craft", patterns: ["medication administration", "\\bdrug round\\b", "prescrib"] },
    { name: "Safeguarding", category: "domain", patterns: ["safeguarding", "child protection", "vulnerable adult"] },
    { name: "Infection Control", category: "domain", patterns: ["infection control", "\\bipc\\b", "aseptic"] },
    { name: "NMC / HCPC Registration", category: "domain", patterns: ["\\bnmc\\b", "\\bhcpc\\b", "\\bgmc\\b", "pin number"] },
    { name: "BLS / ALS", category: "domain", patterns: ["\\bbls\\b", "\\bals\\b", "basic life support", "resuscitation"] },
    { name: "Mental Health", category: "domain", patterns: ["mental health", "\\bcamhs\\b", "mental capacity"] },
    { name: "Record Keeping", category: "craft", patterns: ["record keeping", "clinical notes", "documentation"] },
    { name: "Multidisciplinary Working", category: "communication", patterns: ["multidisciplinary", "\\bmdt\\b"] },
    { name: "Clinical Systems (EPR)", category: "tools", patterns: ["\\bepr\\b", "\\bemis\\b", "systmone", "\\bcerner\\b", "\\bepic\\b"] },
  ],
  coreCategories: ["craft", "domain", "communication", "operations"],
  platforms: [...UNIVERSAL_PLATFORMS],
  workNoun: { singular: "placement", plural: "placements" },
  depthExpectations: [
    "the setting and the caseload",
    "your registration and its status",
    "the interventions you actually delivered",
    "outcomes or audit results, where you can share them",
  ],
  outcomeTerms: ["outcomes", "audit", "reduced", "improved", "compliance", "incidents", "waiting", "%"],
};

const TRADES: DisciplineProfile = {
  key: "trades",
  label: "Skilled trades & technical services",
  blurb: "Judged on tickets held, jobs completed, and safety record.",
  signals: [
    { pattern: /\belectrician\b|\bplumb|\bcarpenter\b|\bwelder\b|\bhvac\b/i, weight: 6 },
    { pattern: /\bcscs\b|\bnvq\b|\bcity ?& ?guilds\b|\b18th edition\b|\bgas safe\b/i, weight: 6 },
    { pattern: /\bsite\b|\bsnagging\b|\bfit.?out\b|\bcommission(ing|ed) plant\b/i, weight: 3 },
    { pattern: /\bcnc\b|\bfabricat|\bmachinist\b|\btoolmaker\b/i, weight: 5 },
    { pattern: /\bppe\b|risk assessment|method statement|\bramst?\b/i, weight: 4 },
    { pattern: /\bmaintenance\b|\bfault find|\bpreventative maintenance\b|\bppm\b/i, weight: 4 },
  ],
  skills: [
    { name: "Electrical Installation", category: "craft", patterns: ["electrical install", "\\b18th edition\\b", "\\bwiring\\b", "consumer unit"] },
    { name: "Plumbing & Heating", category: "craft", patterns: ["plumb", "\\bboiler\\b", "\\bheating system\\b", "gas safe"] },
    { name: "Carpentry & Joinery", category: "craft", patterns: ["carpentr", "joiner", "\\b1st fix\\b", "\\b2nd fix\\b"] },
    { name: "Welding & Fabrication", category: "craft", patterns: ["weld", "fabricat", "\\bmig\\b", "\\btig\\b"] },
    { name: "HVAC", category: "craft", patterns: ["\\bhvac\\b", "air conditioning", "refrigerat", "\\bf.gas\\b"] },
    { name: "CNC & Machining", category: "craft", patterns: ["\\bcnc\\b", "machinist", "lathe", "milling"] },
    { name: "Fault Finding", category: "craft", patterns: ["fault find", "diagnostic", "troubleshoot"] },
    { name: "Preventative Maintenance", category: "operations", patterns: ["preventative maintenance", "\\bppm\\b", "planned maintenance"] },
    { name: "CSCS / NVQ", category: "domain", patterns: ["\\bcscs\\b", "\\bnvq\\b", "city ?& ?guilds", "\\bjib\\b"] },
    { name: "Health & Safety", category: "domain", patterns: ["health (and|&) safety", "\\bppe\\b", "risk assessment", "method statement", "\\biosh\\b", "\\bnebosh\\b"] },
    { name: "Blueprint Reading", category: "craft", patterns: ["blueprint", "technical drawing", "\\bschematic", "\\bcad\\b"] },
    { name: "Quality Inspection", category: "operations", patterns: ["quality (inspect|control|assurance)", "\\bqa\\b", "snagging"] },
  ],
  coreCategories: ["craft", "domain", "operations", "tools"],
  platforms: [...UNIVERSAL_PLATFORMS],
  workNoun: { singular: "job", plural: "jobs" },
  depthExpectations: [
    "the type and scale of the job",
    "the tickets and certifications it needed",
    "what you were responsible for on site",
    "completion, sign-off, or inspection result",
  ],
  outcomeTerms: ["completed", "certified", "passed", "inspection", "downtime", "reduced", "on time", "zero incidents"],
};

const GENERAL: DisciplineProfile = {
  key: "general",
  label: "General",
  blurb: "Judged on the fundamentals that hold in any field: clear evidence and clear outcomes.",
  signals: [],
  skills: [],
  coreCategories: ["craft", "communication", "operations", "tools"],
  platforms: [...UNIVERSAL_PLATFORMS],
  workNoun: { singular: "project", plural: "projects" },
  depthExpectations: [
    "what the work was and who it was for",
    "what you specifically did",
    "the constraints you worked under",
    "how it turned out",
  ],
  outcomeTerms: ["increased", "reduced", "improved", "delivered", "saved", "grew", "%"],
};

export const PROFILES: Record<DisciplineKey, DisciplineProfile> = {
  software: SOFTWARE,
  design: DESIGN,
  data: DATA,
  product: PRODUCT,
  marketing: MARKETING,
  writing: WRITING,
  media: MEDIA,
  business: BUSINESS,
  education: EDUCATION,
  care: CARE,
  trades: TRADES,
  general: GENERAL,
};

/** Order used wherever a user picks their own field. General last — it is the fallback. */
export const DISCIPLINE_ORDER: DisciplineKey[] = [
  "software",
  "design",
  "data",
  "product",
  "marketing",
  "writing",
  "media",
  "business",
  "education",
  "care",
  "trades",
  "general",
];

export const CONTACT_EXPECTATION = CONTACT_NOTE;

export function profileFor(key: DisciplineKey): DisciplineProfile {
  return PROFILES[key] ?? GENERAL;
}
