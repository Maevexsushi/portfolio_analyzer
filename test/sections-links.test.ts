import { describe, expect, it } from "vitest";
import { analyzeSections } from "@/lib/analyzer/sections";
import { analyzeLinks } from "@/lib/analyzer/links";
import { SOFTWARE_PROFILE, ctxFrom, shell, statusOf } from "./helpers";

const NO_NETWORK = { checkLinks: false, maxLinkChecks: 0, profile: SOFTWARE_PROFILE };

const foundIds = (html: string) =>
  analyzeSections(ctxFrom(html))
    .sections.filter((s) => s.found)
    .map((s) => s.id);

describe("section detection by heading wording", () => {
  it("recognises 'Some Things I've Built' as the projects section", () => {
    expect(foundIds(shell("<h1>Ada</h1><h2>Some Things I've Built</h2><p>Work below.</p>"))).toContain(
      "projects",
    );
  });

  it("recognises 'What I've been working on'", () => {
    expect(foundIds(shell("<h1>Ada</h1><h2>What I've been working on</h2><p>Work.</p>"))).toContain(
      "projects",
    );
  });

  it("recognises 'Where I've Worked' as experience", () => {
    expect(foundIds(shell("<h1>Ada</h1><h2>Where I've Worked</h2><p>Jobs.</p>"))).toContain(
      "experience",
    );
  });

  it("recognises 'Tech Stack' as skills", () => {
    expect(foundIds(shell("<h1>Ada</h1><h2>Tech Stack</h2><ul><li>React</li></ul>"))).toContain("skills");
  });

  it("recognises a nav link as evidence of a section", () => {
    const html = shell('<h1>Ada</h1><nav><a href="#projects">Projects</a></nav><div id="projects"><p>x</p></div>');
    expect(foundIds(html)).toContain("projects");
  });

  it("does not invent sections on an empty page", () => {
    const ids = foundIds("<!doctype html><html><body><p>hi</p></body></html>");
    expect(ids).not.toContain("projects");
    expect(ids).not.toContain("skills");
  });
});

describe("contact section detection", () => {
  it("counts a mailto link", () => {
    expect(foundIds(shell('<h1>Ada</h1><a href="mailto:a@b.com">Email</a>'))).toContain("contact");
  });

  it("counts a Gmail compose link", () => {
    const html = shell(
      '<h1>Ada</h1><a href="https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com">Email me</a>',
    );
    expect(foundIds(html)).toContain("contact");
  });

  it("counts a contact form", () => {
    expect(foundIds(shell('<h1>Ada</h1><form><input type="email" name="from"></form>'))).toContain(
      "contact",
    );
  });
});

describe("email contact detection", () => {
  it("passes on a mailto link", async () => {
    const report = await analyzeLinks(ctxFrom(shell('<h1>Ada</h1><a href="mailto:a@b.com">Email</a>')), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("pass");
  });

  it("passes on a Gmail compose link and names the recipient", async () => {
    // The reporter's own portfolio: a compose URL, not mailto.
    const html = shell(
      '<h1>Ada</h1><a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=ada%40example.com&amp;su=Hi">ada@example.com</a>',
    );
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("pass");
    expect(report.essentials.find((e) => e.id === "email")?.note).toContain("ada@example.com");
  });

  it("passes on an Outlook compose link", async () => {
    const html = shell('<h1>Ada</h1><a href="https://outlook.live.com/owa/?path=/mail/action/compose&to=a@b.com">Mail</a>');
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("pass");
  });

  it("warns — not fails — when the address is text but not a link", async () => {
    const html = shell("<h1>Ada</h1><p>Reach me at ada@example.com any time.</p>");
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("warn");
    expect(report.essentials.find((e) => e.id === "email")?.note).toContain("ada@example.com");
  });

  it("fails only when there is no email at all", async () => {
    const report = await analyzeLinks(ctxFrom(shell("<h1>Ada</h1><p>No contact details here.</p>")), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("fail");
  });

  it("ignores placeholder addresses in form fields", async () => {
    const html = shell('<h1>Ada</h1><form><input type="email" placeholder="you@example.com"></form>');
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-email")).toBe("fail");
  });
});

describe("link classification", () => {
  it("finds the code host and LinkedIn for a software profile", async () => {
    const html = shell(`<h1>Ada</h1>
      <a href="https://github.com/ada">GitHub</a>
      <a href="https://www.linkedin.com/in/ada">LinkedIn</a>`);
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-proof-github")).toBe("pass");
    expect(statusOf(report.checks, "links-proof-linkedin")).toBe("pass");
  });

  it("recognises a resume link", async () => {
    const html = shell('<h1>Ada</h1><a href="/ada-resume.pdf">Download resume</a>');
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-resume")).toBe("pass");
  });

  it("flags placeholder links", async () => {
    const html = shell('<h1>Ada</h1><a href="#">One</a><a href="#">Two</a><a href="javascript:void(0)">Three</a>');
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-placeholder")).toBe("fail");
  });

  it("accepts an icon link labelled with aria-label", async () => {
    const html = shell('<h1>Ada</h1><a href="https://github.com/ada" aria-label="GitHub profile"><svg></svg></a>');
    const report = await analyzeLinks(ctxFrom(html), NO_NETWORK);
    expect(statusOf(report.checks, "links-accessible-name")).toBe("pass");
  });

  it("does not report broken links when probing is off", async () => {
    const report = await analyzeLinks(ctxFrom(shell('<h1>Ada</h1><a href="https://x.example">x</a>')), NO_NETWORK);
    expect(report.checks.some((c) => c.id === "links-broken")).toBe(false);
    expect(statusOf(report.checks, "links-not-checked")).toBe("warn");
  });
});
