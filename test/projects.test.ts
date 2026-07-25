import { describe, expect, it } from "vitest";
import { analyzeProjects } from "@/lib/analyzer/projects";
import { ctxFrom, shell } from "./helpers";

const titles = (html: string) => analyzeProjects(ctxFrom(html)).projects.map((p) => p.title);

/** A project card with everything a reviewer wants, in the given wrapper tag. */
function card(name: string, tag = "article"): string {
  return `<${tag}><h3>${name}</h3>
    <img src="/${name}.webp" alt="${name} screenshot" width="600" height="400">
    <p>A scheduling tool that plans the daily delivery routes for a forty-vehicle fleet.
    I built the optimisation service and cut the nightly run from fourteen minutes down to
    forty seconds by replacing nested queries with a single recursive query.</p>
    <ul aria-label="Technologies used"><li>TypeScript</li><li>PostgreSQL</li></ul>
    <a href="https://${name}.example.com">Live demo</a>
    <a href="https://github.com/x/${name}">Source code</a></${tag}>`;
}

describe("project detection across markup shapes", () => {
  it("finds <li> cards in a <ul> grid with utility class names", () => {
    // The shape used by brittanychiang.com: no semantic class names at all.
    const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2>
      <ul class="mt-12">${card("alpha", "li")}${card("beta", "li")}${card("gamma", "li")}</ul>
    </section>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(3);
  });

  it("finds <article> cards in a div grid", () => {
    const html = shell(`<h1>Ada</h1><section id="work"><h2>Selected work</h2>
      <div class="grid">${card("alpha")}${card("beta")}</div></section>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(2);
  });

  it("finds repeated <div> cards", () => {
    const html = shell(`<h1>Ada</h1><h2>Projects</h2>
      <div class="flex">${card("alpha", "div")}${card("beta", "div")}</div>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(2);
  });
});

describe("project detection rejects lists that are not projects", () => {
  it("does not count blog posts as projects", () => {
    const posts = Array.from(
      { length: 4 },
      (_, i) => `<li><h3>Understanding CSS Grid, part ${i}</h3>
        <p>A long-form article about laying out pages with CSS Grid and subgrid in 2026.</p>
        <a href="/blog/css-grid-${i}">Read the article</a></li>`,
    ).join("");
    const html = shell(`<h1>Ada</h1><section><h2>Latest posts</h2><ul>${posts}</ul></section>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(0);
  });

  it("does not count an experience timeline as projects", () => {
    const jobs = `<li><h3>Full-stack engineer — Hafenlogistik</h3>
        <p>Owned the dispatch and billing services, and led the migration to TypeScript.</p></li>
      <li><h3>Junior developer — Studio Nordlicht</h3>
        <p>Built client sites and rebuilt the studio site to pass WCAG AA after an audit.</p></li>`;
    const html = shell(`<h1>Ada</h1><section><h2>Where I've worked</h2><ol>${jobs}</ol></section>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(0);
  });

  it("does not count nav or footer link lists", () => {
    const html = shell(`<h1>Ada</h1>
      <nav><ul><li><a href="/a">Home page of the site</a></li><li><a href="/b">About this site</a></li></ul></nav>
      <footer><ul><li><a href="/privacy">Privacy policy and terms</a></li>
      <li><a href="/terms">Terms of use for this website</a></li></ul></footer>`);
    expect(analyzeProjects(ctxFrom(html)).count).toBe(0);
  });

  it("drops navigation-shaped titles from a genuine grid", () => {
    const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2>
      <div class="grid">${card("alpha")}${card("beta")}
      <article><h3>Browse by category</h3><p>All of the categories on this site, listed out for you.</p>
      <a href="/categories">See all categories</a></article></div></section>`);
    expect(titles(shell(""))).toEqual([]);
    expect(titles(html)).not.toContain("Browse by category");
  });
});

describe("per-project grading", () => {
  const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2>
    <div class="grid">${card("alpha")}${card("beta")}${card("gamma")}</div></section>`);

  it("credits a complete project with full marks", () => {
    const report = analyzeProjects(ctxFrom(html));
    expect(report.projects[0].quality).toBe(100);
    expect(report.projects[0].issues).toEqual([]);
    expect(report.withLiveDemo).toBe(3);
    expect(report.withRepo).toBe(3);
    expect(report.withImage).toBe(3);
  });

  it("counts description words correctly when markup carries no whitespace", () => {
    // Server-rendered output has no spaces between tags; word counts must survive it.
    const compact = shell(
      `<h1>Ada</h1><section id="projects"><h2>Projects</h2><div class="grid">` +
        `<article><h3>Alpha</h3><p>One</p><p>two three four five six seven eight nine ten</p>` +
        `<img src="/a.webp" alt="a"><a href="https://github.com/x/a">Source code</a></article>` +
        `<article><h3>Beta</h3><p>One</p><p>two three four five six seven eight nine ten</p>` +
        `<img src="/b.webp" alt="b"><a href="https://github.com/x/b">Source code</a></article>` +
        `</div></section>`,
    );
    const report = analyzeProjects(ctxFrom(compact));
    expect(report.count).toBe(2);
    // "two three … ten" is nine words; before the fix the tags ran together into one.
    expect(report.projects[0].descriptionWords).toBeGreaterThanOrEqual(9);
  });

  it("reports a missing live demo rather than inventing one from internal navigation", () => {
    const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2><div class="grid">
      <article><h3>Alpha</h3><img src="/a.webp" alt="a">
      <p>A tool for planning delivery routes across a large fleet of vehicles every night.</p>
      <a href="/projects/alpha">Alpha</a></article>
      <article><h3>Beta</h3><img src="/b.webp" alt="b">
      <p>A parser for GPS traces that streams large ride files in constant memory.</p>
      <a href="/projects/beta">Beta</a></article></div></section>`);
    const report = analyzeProjects(ctxFrom(html));
    expect(report.withLiveDemo).toBe(0);
    expect(report.projects[0].issues.join(" ")).toMatch(/live demo/);
  });

  it("keeps a tech stack listed with names outside the known taxonomy", () => {
    const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2><div class="grid">
      <article><h3>Alpha</h3><img src="/a.webp" alt="a">
      <p>A collaborative editor that resolves conflicts without a central server at all.</p>
      <ul aria-label="Technologies used"><li>Zustand</li><li>Drizzle</li><li>Bun</li></ul>
      <a href="https://github.com/x/a">Source code</a></article>
      <article><h3>Beta</h3><img src="/b.webp" alt="b">
      <p>A parser for GPS traces that streams large ride files in constant memory usage.</p>
      <ul aria-label="Technologies used"><li>Zustand</li><li>Drizzle</li></ul>
      <a href="https://github.com/x/b">Source code</a></article></div></section>`);
    const report = analyzeProjects(ctxFrom(html));
    expect(report.projects[0].techTags.length).toBeGreaterThan(0);
    expect(report.projects[0].issues.join(" ")).not.toMatch(/tech stack/);
  });
});

describe("scoring", () => {
  it("scores zero with no projects and says so", () => {
    const report = analyzeProjects(ctxFrom(shell("<h1>Ada</h1><p>Hello.</p>")));
    expect(report.score).toBe(0);
    expect(report.checks.find((c) => c.id === "projects-count")?.status).toBe("fail");
  });

  it("rewards three complete projects", () => {
    const html = shell(`<h1>Ada</h1><section id="projects"><h2>Projects</h2>
      <div class="grid">${card("alpha")}${card("beta")}${card("gamma")}</div></section>`);
    expect(analyzeProjects(ctxFrom(html)).score).toBe(100);
  });
});
