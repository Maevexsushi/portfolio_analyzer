import type { AtsReport, Check } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";
import { headingLines } from "./sections";

/**
 * Applicant tracking system readability.
 *
 * This is the most valuable section in the whole resume report and the one an applicant
 * has no way to run themselves. A resume that looks immaculate in a viewer can arrive at
 * the employer as an empty record, and the candidate never learns why they heard
 * nothing. Everything here is checked against the text layer — the same bytes a parser
 * gets — rather than against how the page appears.
 *
 * The claims are deliberately bounded. There are hundreds of ATS products and they
 * differ; what is asserted is only what follows from the extracted text itself.
 */

/** Headings parsers map to fields without guessing. */
const STANDARD_HEADINGS = [
  /^(work|professional|employment)?\s*experience\b/i,
  /^employment (history|record)\b/i,
  /^education\b/i,
  /^(technical |core |key )?skills?\b/i,
  /^(professional )?summary\b/i,
  /^profile\b/i,
  /^objective\b/i,
  /^certifications?\b/i,
  /^projects?\b/i,
  /^awards?\b/i,
  /^publications?\b/i,
  /^languages?\b/i,
  /^references\b/i,
  /^volunteer(ing)?\b/i,
];

/** Filenames that arrive in a recruiter's inbox and say something unintended. */
const UNPROFESSIONAL_NAME =
  /\b(final|final2|finalfinal|draft|copy|copy ?\d|new|updated?|latest|v\d+|version ?\d+|untitled|document\d*|resume ?\d+|cv ?\d+|asdf|test)\b/i;

/**
 * Column detection.
 *
 * A two-column resume reads correctly to a human and scrambles in most parsers, which
 * interleave the columns line by line. The tell is a text layer where short fragments
 * dominate: a side column of skills and dates extracts as dozens of two-word lines
 * interleaved with the body. Long-line documents are single-column.
 */
function suspectsColumns(document: ExtractedDocument): boolean {
  const lines = document.lines.filter((line) => line.length > 0);
  if (lines.length < 25) return false;

  const shortFragments = lines.filter((line) => line.length <= 22 && !/[.;:]$/.test(line)).length;
  const longLines = lines.filter((line) => line.length >= 60).length;

  return shortFragments / lines.length > 0.45 && longLines / lines.length < 0.15;
}

export function analyzeAts(document: ExtractedDocument): AtsReport {
  const machineReadable = document.origin === "embedded";

  /*
   * The name at the top of a resume is short and usually set in capitals, so the
   * heading heuristic picks it up — and the panel then tells the author their own name
   * is "a heading no parser will map", which is both wrong and faintly absurd. The
   * first couple of lines are the header block, never a section.
   */
  const headerLines = new Set(document.lines.slice(0, 2));
  const headings = headingLines(document).filter((heading) => !headerLines.has(heading));

  const standardHeadings = headings.filter((heading) =>
    STANDARD_HEADINGS.some((pattern) => pattern.test(heading)),
  );
  const nonStandardHeadings = headings.filter(
    (heading) => !STANDARD_HEADINGS.some((pattern) => pattern.test(heading)),
  );

  const suspectedColumns = suspectsColumns(document);
  const wordsPerPage =
    document.pageCount && document.pageCount > 0
      ? Math.round(document.wordCount / document.pageCount)
      : null;

  const baseName = document.fileName.replace(/\.[^.]+$/, "");
  const fileNameProfessional =
    baseName.length > 0 && baseName.length <= 60 && !UNPROFESSIONAL_NAME.test(baseName);

  const checks: Check[] = [
    {
      id: "ats-readable",
      label: "Machine-readable text",
      status: machineReadable ? "pass" : "fail",
      detail: machineReadable
        ? `Text extracts cleanly — ${document.wordCount} words an employer's system can read and search.`
        : "This file has no text layer: its words exist only as pixels. Every applicant tracking system will store it as an empty record, and no keyword search will ever return it. Export a PDF from the original document instead of sending an image or a scan.",
    },
    {
      id: "ats-headings",
      label: "Standard section headings",
      status:
        standardHeadings.length >= 3 ? "pass" : standardHeadings.length >= 1 ? "warn" : "fail",
      detail:
        standardHeadings.length >= 3
          ? `Recognised: ${standardHeadings.slice(0, 6).join(", ")}.`
          : `Only ${standardHeadings.length} recognisable heading${standardHeadings.length === 1 ? "" : "s"}. Parsers map "Experience" and "Education" to fields; "Where I've Been" and "My Journey" they file under nothing.${
              nonStandardHeadings.length > 0
                ? ` Non-standard: ${nonStandardHeadings.slice(0, 4).join(", ")}.`
                : ""
            }`,
    },
    {
      id: "ats-columns",
      label: "Single-column layout",
      status: suspectedColumns ? "warn" : "pass",
      detail: suspectedColumns
        ? "The extracted text is mostly short fragments, which is what a multi-column layout looks like to a parser — the columns interleave and sentences come out shuffled. Check how your resume reads when you copy all of it into a plain text editor; that is roughly what the employer receives."
        : "Text extracts in a sensible reading order.",
    },
    {
      id: "ats-filename",
      label: "Professional file name",
      status: fileNameProfessional ? "pass" : "warn",
      detail: fileNameProfessional
        ? `"${document.fileName}" is fine.`
        : `"${document.fileName}" is what a recruiter sees in their inbox and in their file system. Rename it to Firstname-Lastname-Role.pdf.`,
    },
  ];

  if (wordsPerPage !== null) {
    checks.push({
      id: "ats-density",
      label: "Text density",
      status: wordsPerPage >= 180 && wordsPerPage <= 650 ? "pass" : "warn",
      detail:
        wordsPerPage < 180
          ? `About ${wordsPerPage} words per page — sparse. Either there is more to say, or the content would read better on fewer pages.`
          : wordsPerPage > 650
            ? `About ${wordsPerPage} words per page. Dense enough that a reader skimming for seven seconds will find nothing; cut, or give it more room.`
            : `About ${wordsPerPage} words per page, which reads comfortably.`,
    });
  }

  if (document.imageCount > 0 && machineReadable) {
    checks.push({
      id: "ats-images",
      label: "Text is not trapped in images",
      status: document.imageCount > 4 ? "warn" : "pass",
      detail:
        document.imageCount > 4
          ? `${document.imageCount} images. Anything written inside them — a skills chart, a header banner, a logo bar — is invisible to search and to parsers.`
          : `${document.imageCount} image${document.imageCount === 1 ? "" : "s"}, with the text outside them.`,
    });
  }

  /*
   * Tagging and a declared language are read from the PDF itself (see
   * ExtractedDocument.accessibility) rather than inferred from text, so they only apply
   * to that format — a .docx or an image has no equivalent property to check.
   */
  if (document.accessibility) {
    checks.push({
      id: "ats-tagged-pdf",
      label: "Tagged for screen readers",
      status: document.accessibility.tagged ? "pass" : "warn",
      detail: document.accessibility.tagged
        ? "This PDF declares a tag structure, which is what lets a screen reader announce its content in order rather than reading nothing at all."
        : "This PDF has no tag structure. A sighted reviewer sees the same page either way, but a screen reader gets nothing usable from it — most export paths (Word, Google Docs, LaTeX) do not tag by default; Word's \"Save as Accessible PDF\" and Acrobat's \"Prepare for accessibility\" do.",
    });
    checks.push({
      id: "ats-pdf-language",
      label: "Document language declared",
      status: document.accessibility.language ? "pass" : "warn",
      detail: document.accessibility.language
        ? `Declared as "${document.accessibility.language}".`
        : "No language is declared in the file. A screen reader falls back to its default voice and pronunciation, which is wrong for anyone reading it in a language other than that default.",
    });
  }

  return {
    score: scoreFromChecks(checks, {
      "ats-readable": 4,
      "ats-headings": 2.5,
      "ats-columns": 2,
      "ats-filename": 1,
      "ats-density": 1,
      "ats-images": 1,
      "ats-tagged-pdf": 1.5,
      "ats-pdf-language": 0.75,
    }),
    machineReadable,
    standardHeadings,
    nonStandardHeadings,
    suspectedColumns,
    wordsPerPage,
    fileNameProfessional,
    checks,
  };
}
