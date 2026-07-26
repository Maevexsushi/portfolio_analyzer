import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { AnalysisResult, AnyResult, Check, CheckStatus, Severity } from "./types";
import { formatBytes, formatDateTime, formatMs } from "./format";
import { bandFor } from "./format";

/**
 * PDF Report Export.
 *
 * pdf-lib has no layout engine, so this module is one: a downward cursor with an
 * automatic page break, a text wrapper measured against the embedded font, and a few
 * primitives (heading, paragraph, meter row, check row). Standard fonts are WinAnsi-only,
 * so all text passes through `safe()` first — an un-encodable character would otherwise
 * throw at draw time and fail the whole export.
 */

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM_LIMIT = 64;

const INK = rgb(0.07, 0.08, 0.11);
const INK_SOFT = rgb(0.24, 0.27, 0.33);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.886, 0.898, 0.925);
const SURFACE_2 = rgb(0.945, 0.953, 0.968);
const WHITE = rgb(1, 1, 1);

const MARK = {
  good: rgb(0.047, 0.639, 0.047),
  warn: rgb(0.98, 0.698, 0.098),
  bad: rgb(0.816, 0.231, 0.231),
  seq: rgb(0.165, 0.471, 0.839),
};

const STATUS_MARK: Record<CheckStatus, ReturnType<typeof rgb>> = {
  pass: MARK.good,
  warn: MARK.warn,
  fail: MARK.bad,
};

const STATUS_GLYPH: Record<CheckStatus, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };

const SEVERITY_MARK: Record<Severity, ReturnType<typeof rgb>> = {
  critical: MARK.bad,
  important: MARK.warn,
  polish: rgb(0.796, 0.82, 0.867),
};

/** Standard PDF fonts encode WinAnsi only; map typography and drop the rest. */
function safe(input: string): string {
  const mapped = input
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    // The whole U+2010-2015 dash run, not just en/em: models reach for the
    // non-breaking hyphen (U+2011) constantly, and it has no WinAnsi codepoint.
    .replace(/[‐-―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•·]/g, "-")
    .replace(/×/g, "x")
    .replace(/[←-⇿]/g, "->");

  let out = "";
  let dropped = false;
  for (const char of mapped) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10) {
      out += " ";
      continue;
    }
    // WinAnsi has holes in 0x80-0x9F; restrict to what always encodes.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) {
      out += char;
      dropped = false;
    } else if (!dropped) {
      out += "?";
      dropped = true;
    }
  }
  return out;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class ReportBuilder {
  private readonly doc: PDFDocument;
  private readonly fonts: Fonts;
  private page: PDFPage;
  private y: number;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  /** Reserve vertical space, breaking to a new page when it will not fit. */
  private reserve(height: number): void {
    if (this.y - height < BOTTOM_LIMIT) this.newPage();
    this.y -= height;
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];

    for (const paragraph of safe(text).split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let current = "";

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);

        // A single word longer than the column has to be broken by character.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = "";
          for (const char of word) {
            if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
      lines.push(current);
    }

    return lines.filter((line) => line.length > 0);
  }

  text(
    content: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      x?: number;
      width?: number;
      leading?: number;
      gapAfter?: number;
    } = {},
  ): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = options.width ?? CONTENT_WIDTH - ((options.x ?? MARGIN) - MARGIN);
    const leading = options.leading ?? size * 1.38;
    const lines = this.wrap(content, font, size, width);

    for (const line of lines) {
      this.reserve(leading);
      this.page.drawText(line, {
        x: options.x ?? MARGIN,
        y: this.y,
        size,
        font,
        color: options.color ?? INK,
      });
    }
    if (options.gapAfter) this.gap(options.gapAfter);
  }

  gap(height: number): void {
    if (this.y - height < BOTTOM_LIMIT) this.newPage();
    else this.y -= height;
  }

  rule(): void {
    this.reserve(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: LINE,
    });
    this.gap(4);
  }

  heading(title: string, score?: number): void {
    // Keep a heading with at least a couple of lines of its section.
    if (this.y < BOTTOM_LIMIT + 90) this.newPage();
    this.gap(10);
    this.reserve(14);

    this.page.drawText(safe(title), {
      x: MARGIN,
      y: this.y,
      size: 13,
      font: this.fonts.bold,
      color: INK,
    });

    if (score !== undefined) {
      const label = `${score}/100`;
      const width = this.fonts.bold.widthOfTextAtSize(label, 10);
      this.page.drawCircle({
        x: PAGE.width - MARGIN - width - 12,
        y: this.y + 3.5,
        size: 3.5,
        color: STATUS_MARK[scoreStatus(score)],
      });
      this.page.drawText(label, {
        x: PAGE.width - MARGIN - width,
        y: this.y,
        size: 10,
        font: this.fonts.bold,
        color: INK_SOFT,
      });
    }

    this.gap(6);
    this.rule();
  }

  /** Small labelled sub-heading with a colour dot, used for severity groups. */
  severityHeading(label: string, count: number, mark: ReturnType<typeof rgb>): void {
    this.reserve(12);
    this.page.drawCircle({ x: MARGIN + 3, y: this.y + 3, size: 3, color: mark });
    this.page.drawText(safe(`${label.toUpperCase()} (${count})`), {
      x: MARGIN + 11,
      y: this.y,
      size: 8.5,
      font: this.fonts.bold,
      color: INK_SOFT,
    });
    this.gap(6);
  }

  /** Label + track + fill + value, used for the score breakdown. */
  meterRow(label: string, value: number, note?: string): void {
    const rowHeight = 13;
    this.reserve(rowHeight);
    const labelWidth = 150;
    const barX = MARGIN + labelWidth;
    const barWidth = CONTENT_WIDTH - labelWidth - 46;
    const fill = STATUS_MARK[scoreStatus(value)];

    this.page.drawText(safe(label), {
      x: MARGIN,
      y: this.y,
      size: 9.5,
      font: this.fonts.regular,
      color: INK_SOFT,
    });
    this.page.drawRectangle({
      x: barX,
      y: this.y - 0.5,
      width: barWidth,
      height: 7,
      color: WHITE,
      borderColor: LINE,
      borderWidth: 0.75,
    });
    this.page.drawRectangle({
      x: barX,
      y: this.y - 0.5,
      width: Math.max(1.5, (Math.min(100, value) / 100) * barWidth),
      height: 7,
      color: fill,
    });

    const valueLabel = String(value);
    this.page.drawText(valueLabel, {
      x: PAGE.width - MARGIN - this.fonts.bold.widthOfTextAtSize(valueLabel, 9.5),
      y: this.y,
      size: 9.5,
      font: this.fonts.bold,
      color: INK,
    });

    if (note) {
      this.gap(2);
      this.text(note, { size: 8.5, color: MUTED, x: MARGIN + labelWidth, width: barWidth });
    }
    this.gap(5);
  }

  checkRow(check: Check): void {
    const badgeWidth = 30;
    const textX = MARGIN + badgeWidth + 8;
    const textWidth = CONTENT_WIDTH - badgeWidth - 8;

    this.reserve(11);
    const badgeY = this.y;

    this.page.drawRectangle({
      x: MARGIN,
      y: badgeY - 2,
      width: badgeWidth,
      height: 11,
      color: STATUS_MARK[check.status],
    });
    this.page.drawText(STATUS_GLYPH[check.status], {
      x: MARGIN + 3,
      y: badgeY + 1,
      size: 6.5,
      font: this.fonts.bold,
      color: WHITE,
    });
    this.page.drawText(safe(check.label), {
      x: textX,
      y: badgeY,
      size: 9.5,
      font: this.fonts.bold,
      color: INK,
    });

    this.gap(2);
    this.text(check.detail, { size: 9, color: INK_SOFT, x: textX, width: textWidth });
    this.gap(5);
  }

  keyValueGrid(rows: [string, string][]): void {
    const columnWidth = CONTENT_WIDTH / 2;
    for (let index = 0; index < rows.length; index += 2) {
      this.reserve(12);
      const rowY = this.y;
      rows.slice(index, index + 2).forEach(([key, value], column) => {
        const x = MARGIN + column * columnWidth;
        this.page.drawText(safe(key), {
          x,
          y: rowY,
          size: 9,
          font: this.fonts.regular,
          color: MUTED,
        });
        const valueText = safe(value);
        const valueWidth = this.fonts.bold.widthOfTextAtSize(valueText, 9);
        const maxRight = x + columnWidth - 14;
        this.page.drawText(valueText, {
          x: Math.max(x + 90, maxRight - valueWidth),
          y: rowY,
          size: 9,
          font: this.fonts.bold,
          color: INK,
        });
      });
      this.gap(3);
    }
  }

  chips(items: string[], accent = false): void {
    let x = MARGIN;
    const size = 8.5;
    const height = 13;
    this.reserve(height);
    let rowY = this.y;

    for (const item of items) {
      const label = safe(item);
      const width = this.fonts.regular.widthOfTextAtSize(label, size) + 10;
      if (x + width > PAGE.width - MARGIN) {
        // A wrap can push us onto a new page, so re-read the cursor afterwards.
        this.gap(height + 3);
        rowY = this.y;
        x = MARGIN;
      }
      this.page.drawRectangle({
        x,
        y: rowY - 3,
        width,
        height,
        color: accent ? SURFACE_2 : WHITE,
        borderColor: LINE,
        borderWidth: 0.75,
      });
      this.page.drawText(label, {
        x: x + 5,
        y: rowY,
        size,
        font: this.fonts.regular,
        color: INK_SOFT,
      });
      x += width + 4;
    }
    this.gap(height + 2);
  }

  heroScore(result: AnyResult): void {
    const boxHeight = 92;
    this.reserve(boxHeight);
    const top = this.y + boxHeight;
    const fill = STATUS_MARK[scoreStatus(result.overallScore)];

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: WHITE,
      borderColor: LINE,
      borderWidth: 0.75,
    });

    this.page.drawText("PORTFOLIO SCORE", {
      x: MARGIN + 16,
      y: top - 22,
      size: 8,
      font: this.fonts.bold,
      color: MUTED,
    });
    this.page.drawText(String(result.overallScore), {
      x: MARGIN + 16,
      y: top - 58,
      size: 34,
      font: this.fonts.bold,
      color: INK,
    });
    const scoreWidth = this.fonts.bold.widthOfTextAtSize(String(result.overallScore), 34);
    this.page.drawText("/100", {
      x: MARGIN + 20 + scoreWidth,
      y: top - 58,
      size: 12,
      font: this.fonts.regular,
      color: MUTED,
    });

    // Grade badge
    const grade = result.grade;
    const gradeWidth = this.fonts.bold.widthOfTextAtSize(grade, 14) + 16;
    this.page.drawRectangle({
      x: MARGIN + 28 + scoreWidth + this.fonts.regular.widthOfTextAtSize("/100", 12),
      y: top - 60,
      width: gradeWidth,
      height: 22,
      color: fill,
    });
    this.page.drawText(grade, {
      x: MARGIN + 36 + scoreWidth + this.fonts.regular.widthOfTextAtSize("/100", 12),
      y: top - 54,
      size: 14,
      font: this.fonts.bold,
      color: WHITE,
    });

    // Meter across the bottom of the box
    const barWidth = CONTENT_WIDTH - 32;
    this.page.drawRectangle({
      x: MARGIN + 16,
      y: top - 78,
      width: barWidth,
      height: 7,
      color: SURFACE_2,
    });
    this.page.drawRectangle({
      x: MARGIN + 16,
      y: top - 78,
      width: Math.max(2, (result.overallScore / 100) * barWidth),
      height: 7,
      color: fill,
    });

    const verdictLines = this.wrap(result.verdict, this.fonts.regular, 9, barWidth);
    this.page.drawText(verdictLines[0] ?? "", {
      x: MARGIN + 16,
      y: top - 90,
      size: 9,
      font: this.fonts.regular,
      color: INK_SOFT,
    });

    this.gap(12);
  }

  /** Page numbers are stamped last, once the total is known. */
  finish(footerNote: string): void {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: 44 },
        end: { x: PAGE.width - MARGIN, y: 44 },
        thickness: 0.75,
        color: LINE,
      });
      page.drawText(safe(footerNote), {
        x: MARGIN,
        y: 32,
        size: 7.5,
        font: this.fonts.regular,
        color: MUTED,
      });
      const label = `Page ${index + 1} of ${pages.length}`;
      page.drawText(label, {
        x: PAGE.width - MARGIN - this.fonts.regular.widthOfTextAtSize(label, 7.5),
        y: 32,
        size: 7.5,
        font: this.fonts.regular,
        color: MUTED,
      });
    });
  }
}

function scoreStatus(score: number): CheckStatus {
  const band = bandFor(score);
  return band === "good" ? "pass" : band === "warn" ? "warn" : "fail";
}

/** The common opening: cover, hero score, weighted breakdown, caveats, editorial read. */
function writePreamble(report: ReportBuilder, result: AnyResult, subject: string, subtitle: string) {
  const kindTitle =
    result.kind === "resume"
      ? "Resume analysis report"
      : result.kind === "document"
        ? "Portfolio document report"
        : "Portfolio analysis report";

  report.text(kindTitle, { size: 20, bold: true });
  report.gap(4);
  report.text(subject, { size: 10, color: MARK.seq });
  report.text(subtitle, { size: 9, color: MUTED });
  report.gap(10);
  report.heroScore(result);

  report.heading("Score breakdown");
  for (const entry of result.breakdown) {
    report.meterRow(
      `${entry.label} (${Math.round(entry.weight * 100)}%)`,
      entry.score,
      entry.summary,
    );
  }

  report.heading("What this report assumed");
  report.text(
    `Field: ${result.discipline.label}${
      result.discipline.chosen
        ? " (you selected this)"
        : ` (detected, ${result.discipline.confidence}% confidence${
            result.discipline.evidence.length > 0
              ? `; matched ${result.discipline.evidence.join(", ")}`
              : ""
          })`
    }. ${result.discipline.blurb} Every check below is aimed at that field's expectations.`,
    { size: 9, color: INK_SOFT },
  );

  if (result.warnings.length > 0) {
    report.heading("Caveats");
    for (const warning of result.warnings) {
      report.text(`- ${warning}`, { size: 9, color: INK_SOFT });
      report.gap(2);
    }
  }

  writeAiSection(report, result);

  report.heading("What to fix");
  writeSuggestions(report, result);
}

function writeAiSection(report: ReportBuilder, result: AnyResult) {
  if (!result.ai) return;

  report.heading("Your edge");
  if (result.ai.pitch) {
    report.text(result.ai.pitch, { size: 11, bold: true });
    report.text("The pitch this currently earns.", { size: 8, color: MUTED });
    report.gap(6);
  }
  if (result.ai.positioning) {
    report.text(result.ai.positioning, { size: 9.5, color: INK_SOFT });
    report.gap(6);
  }

  const groups: [string, typeof result.ai.strengths][] = [
    ["Lead with this", result.ai.strengths],
    ["You are underselling", result.ai.underselling],
  ];
  for (const [label, items] of groups) {
    if (items.length === 0) continue;
    report.text(label, { size: 10, bold: true });
    report.gap(3);
    for (const item of items) {
      report.text(`- ${item.title}`, { size: 9.5, bold: true });
      report.text(item.evidence, { size: 9, color: INK_SOFT, x: MARGIN + 12 });
      report.gap(4);
    }
    report.gap(2);
  }

  if (result.ai.standoutProject) {
    report.text(`Strongest piece: ${result.ai.standoutProject}`, { size: 9, color: INK_SOFT });
  }
  if (result.ai.bestFitRoles.length > 0) {
    report.text(`Reads as competitive for: ${result.ai.bestFitRoles.join(", ")}.`, {
      size: 9,
      color: INK_SOFT,
    });
  }
  report.gap(3);
  report.text(
    `Generated by ${result.ai.model}. A model's opinion, not a measurement — check each claim against the evidence beside it.`,
    { size: 8, color: MUTED },
  );
}

function writeSuggestions(report: ReportBuilder, result: AnyResult) {
  if (result.suggestions.length === 0) {
    report.text("Nothing to fix — every check passed.", { size: 9.5, color: INK_SOFT });
    return;
  }

  for (const severity of ["critical", "important", "polish"] as Severity[]) {
    const items = result.suggestions.filter((s) => s.severity === severity);
    if (items.length === 0) continue;

    report.gap(4);
    report.severityHeading(severity, items.length, SEVERITY_MARK[severity]);

    items.forEach((suggestion, index) => {
      report.text(`${index + 1}. ${suggestion.title}  (+${suggestion.impact} pts)`, {
        size: 9.5,
        bold: true,
      });
      report.gap(1);
      report.text(suggestion.detail, { size: 9, color: INK_SOFT, x: MARGIN + 12 });
      report.gap(4);
    });
  }
}

export async function buildReportPdf(result: AnyResult): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const subject = result.kind === "website" ? result.finalUrl : result.upload.fileName;
  doc.setTitle(`Analysis — ${subject}`);
  doc.setSubject(`Score ${result.overallScore}/100 (${result.grade})`);
  doc.setCreator("Portfolio Analyzer");

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const report = new ReportBuilder(doc, fonts);

  if (result.kind === "resume") {
    writeResumeReport(report, result);
  } else if (result.kind === "document") {
    writeDocumentReport(report, result);
  } else {
    writeWebsiteReport(report, result);
  }

  report.finish(
    `Portfolio Analyzer — ${subject} on ${formatDateTime(result.analyzedAt)}. Scores are heuristic.`,
  );

  return doc.save();
}

function writeResumeReport(report: ReportBuilder, result: Extract<AnyResult, { kind: "resume" }>) {
  writePreamble(
    report,
    result,
    result.upload.fileName,
    `${result.upload.format.toUpperCase()}${
      result.upload.pageCount ? `, ${result.upload.pageCount} pages` : ""
    } · analyzed ${formatDateTime(result.analyzedAt)} in ${formatMs(result.durationMs)}`,
  );

  report.heading("Machine readability", result.ats.score);
  for (const check of result.ats.checks) report.checkRow(check);

  report.heading("Experience & impact", result.experience.score);
  for (const check of result.experience.checks) report.checkRow(check);
  if (result.experience.entries.length > 0) {
    report.gap(6);
    report.text("Role by role", { size: 10, bold: true });
    report.gap(4);
    for (const entry of result.experience.entries) {
      report.text(entry.title, { size: 9.5, bold: true });
      report.text(
        `${entry.bulletCount} bullets · ${entry.quantifiedBullets} with numbers · ${entry.actionVerbBullets} action-led`,
        { size: 8.5, color: MUTED, x: MARGIN + 12 },
      );
      for (const weak of entry.weakBullets) {
        report.text(`Rewrite: "${weak}"`, { size: 8.5, color: INK_SOFT, x: MARGIN + 12 });
      }
      report.gap(5);
    }
  }

  report.heading("Structure", result.structure.score);
  for (const check of result.structure.checks) report.checkRow(check);

  report.heading("Contact & reachability", result.contact.score);
  for (const check of result.contact.checks) report.checkRow(check);

  writeSkills(report, result.skills);

  report.heading("Writing", result.language.score);
  for (const check of result.language.checks) report.checkRow(check);
}

function writeDocumentReport(
  report: ReportBuilder,
  result: Extract<AnyResult, { kind: "document" }>,
) {
  writePreamble(
    report,
    result,
    result.upload.fileName,
    `${result.upload.format.toUpperCase()}${
      result.upload.pageCount ? `, ${result.upload.pageCount} pages` : ""
    } · analyzed ${formatDateTime(result.analyzedAt)} in ${formatMs(result.durationMs)}`,
  );

  report.heading("The work", result.work.score);
  for (const check of result.work.checks) report.checkRow(check);
  if (result.work.works.length > 0) {
    report.gap(6);
    report.text("Piece by piece", { size: 10, bold: true });
    report.gap(4);
    for (const work of result.work.works) {
      report.text(`p${work.page} — ${work.title}`, { size: 9.5, bold: true });
      report.text(
        `${work.wordCount} words · ${work.imageCount} images${
          work.issues.length > 0 ? ` · missing: ${work.issues.join("; ")}` : ""
        }`,
        { size: 8.5, color: MUTED, x: MARGIN + 12 },
      );
      report.gap(4);
    }
  }

  report.heading("Presentation", result.presentation.score);
  for (const check of result.presentation.checks) report.checkRow(check);

  report.heading("Deliverability", result.deliverability.score);
  for (const check of result.deliverability.checks) report.checkRow(check);

  report.heading("Contact & reachability", result.contact.score);
  for (const check of result.contact.checks) report.checkRow(check);

  writeSkills(report, result.skills);
}

function writeSkills(report: ReportBuilder, skills: AnalysisResult["skills"]) {
  report.heading("Skills detected", skills.score);
  for (const check of skills.checks) report.checkRow(check);
  if (skills.skills.length > 0) {
    report.gap(4);
    report.chips(
      skills.skills.map((skill) => (skill.declared ? `${skill.name} *` : skill.name)),
      true,
    );
    report.text("* listed in a skills section; the rest were inferred from the text.", {
      size: 8,
      color: MUTED,
    });
  }
}

function writeWebsiteReport(report: ReportBuilder, result: AnalysisResult) {
  writePreamble(
    report,
    result,
    result.finalUrl,
    `${result.meta.title || "Untitled page"} · analyzed ${formatDateTime(result.analyzedAt)} in ${formatMs(result.durationMs)}`,
  );

  report.heading("At a glance");
  report.keyValueGrid([
    ["Projects found", String(result.projects.count)],
    ["Average project depth", `${result.projects.averageQuality}/100`],
    [
      "Expected sections",
      `${result.sections.requiredFound} of ${result.sections.requiredTotal}`,
    ],
    ["Bonus sections", String(result.sections.bonusFound)],
    ["Skills detected", String(result.skills.total)],
    ["Skill categories", String(result.skills.categoriesCovered.length)],
    ["Links found", String(result.links.total)],
    [
      "Broken links",
      result.links.checkedCount === 0
        ? "not checked"
        : `${result.links.brokenCount} of ${result.links.checkedCount}`,
    ],
    ["Images missing alt", `${result.design.imagesMissingAlt} of ${result.design.imagesTotal}`],
    ["Time to first byte", formatMs(result.performance.ttfbMs)],
    ["HTML size", formatBytes(result.performance.htmlBytes)],
    ["Compression", result.performance.compression ?? "none"],
  ]);

  /* sections */
  report.heading("Portfolio sections", result.sections.score);
  for (const section of result.sections.sections.filter((s) => s.required)) {
    report.checkRow({
      id: section.id,
      label: section.label,
      status: section.found ? "pass" : "fail",
      detail: section.found ? section.evidence.join(" · ") || "Found" : "Not found on the page.",
    });
  }
  const bonusFound = result.sections.sections.filter((s) => !s.required && s.found);
  const bonusMissing = result.sections.sections.filter((s) => !s.required && !s.found);
  report.gap(2);
  report.text(
    `Bonus sections present: ${bonusFound.length > 0 ? bonusFound.map((s) => s.label).join(", ") : "none"}.`,
    { size: 9, color: INK_SOFT },
  );
  report.text(`Not present: ${bonusMissing.map((s) => s.label).join(", ") || "none"}.`, {
    size: 9,
    color: MUTED,
  });

  /* projects */
  report.heading("Projects", result.projects.score);
  for (const check of result.projects.checks) report.checkRow(check);

  if (result.projects.projects.length > 0) {
    report.gap(6);
    report.text("Project by project", { size: 10, bold: true });
    report.gap(4);
    for (const project of result.projects.projects) {
      report.text(`${project.title}  —  depth ${project.quality}/100`, { size: 9.5, bold: true });
      report.gap(1);
      const facts = [
        `${project.descriptionWords} words`,
        project.liveUrl ? "live demo" : "no live demo",
        project.repoUrl ? "source linked" : "no source link",
        `${project.imageCount} image${project.imageCount === 1 ? "" : "s"}`,
        project.techTags.length > 0 ? project.techTags.join(", ") : "no stack listed",
      ];
      report.text(facts.join(" · "), { size: 8.5, color: MUTED, x: MARGIN + 12 });
      if (project.issues.length > 0) {
        report.text(`Missing: ${project.issues.join("; ")}.`, {
          size: 8.5,
          color: INK_SOFT,
          x: MARGIN + 12,
        });
      }
      report.gap(5);
    }
  }

  /* skills */
  report.heading("Skills detected", result.skills.score);
  for (const check of result.skills.checks) report.checkRow(check);
  if (result.skills.skills.length > 0) {
    report.gap(4);
    report.chips(
      result.skills.skills.map((skill) => (skill.declared ? `${skill.name} *` : skill.name)),
      true,
    );
    report.text("* listed in a skills section; the rest were inferred from page text.", {
      size: 8,
      color: MUTED,
    });
  }

  /* links */
  report.heading("Links & contact", result.links.score);
  for (const essential of result.links.essentials) {
    report.checkRow({
      id: essential.id,
      label: essential.label,
      status: essential.status,
      detail: essential.note ?? essential.url ?? "Not found.",
    });
  }
  for (const check of result.links.checks) report.checkRow(check);
  if (result.links.broken.length > 0) {
    report.gap(4);
    report.text("Broken links", { size: 10, bold: true });
    report.gap(3);
    for (const link of result.links.broken) {
      report.text(
        `${link.status ? `HTTP ${link.status}` : (link.error ?? "Unreachable")} - ${link.url}`,
        { size: 8.5, color: INK_SOFT },
      );
      report.gap(2);
    }
  }

  if (result.links.unverified.length > 0) {
    report.gap(4);
    report.text("Could not be verified (host blocks automated requests)", {
      size: 10,
      bold: true,
    });
    report.gap(3);
    for (const link of result.links.unverified) {
      report.text(`HTTP ${link.status} - ${link.url}`, { size: 8.5, color: MUTED });
      report.gap(2);
    }
  }

  /* design */
  report.heading("Design & accessibility", result.design.score);
  for (const check of result.design.checks) report.checkRow(check);
  report.gap(4);
  report.text(
    `Typefaces: ${result.design.fonts.length > 0 ? result.design.fonts.join(", ") : "none detected"}. ` +
      `Colours declared: ${result.design.palette.length}. ` +
      `Landmarks: ${result.design.semanticLandmarks.map((tag) => `<${tag}>`).join(" ") || "none"}.`,
    { size: 9, color: INK_SOFT },
  );

  /* performance */
  report.heading("Performance", result.performance.score);
  for (const check of result.performance.checks) report.checkRow(check);
  report.gap(4);
  report.keyValueGrid([
    ["Requests referenced", String(result.performance.requestCount)],
    ["Render-blocking scripts", String(result.performance.renderBlockingScripts)],
    ["Stylesheets", String(result.performance.renderBlockingStyles)],
    [
      "Inline CSS + JS",
      formatBytes(result.performance.inlineStyleBytes + result.performance.inlineScriptBytes),
    ],
    ["Images", `${result.performance.imagesTotal} (${result.performance.imagesLazy} lazy)`],
    ["Cache-Control", result.performance.cacheControl ?? "none"],
  ]);
}
