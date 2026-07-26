/**
 * Document intake.
 *
 * Three formats arrive here — PDF, DOCX, and images — and exactly one shape leaves.
 * Every analyzer downstream reads `ExtractedDocument` and nothing else, so adding a
 * fourth format later is a new extractor rather than a change to the checks.
 *
 * The fidelity fields matter as much as the text. A resume's single most important
 * property is whether an applicant tracking system can read it at all, and that is a
 * question about *how* the text was obtained: a real PDF text layer parses everywhere,
 * a scan run through OCR parses nowhere. Losing that distinction during extraction
 * would make the most valuable check in the whole tool impossible to write.
 */

export type SourceFormat = "pdf" | "docx" | "image";

/** How the text was obtained, in descending order of trust. */
export type TextOrigin =
  /** A real text layer or document XML — what an ATS will also see. */
  | "embedded"
  /** Recognised from pixels. Approximate, and invisible to every ATS. */
  | "ocr";

export interface ExtractedPage {
  /** 1-based, matching what the reader sees in a viewer. */
  number: number;
  text: string;
  lines: string[];
  wordCount: number;
  /** Points, at scale 1. Null when the format has no page geometry. */
  width: number | null;
  height: number | null;
  imageCount: number;
}

export interface ExtractedDocument {
  format: SourceFormat;
  origin: TextOrigin;
  fileName: string;
  bytes: number;
  /** Full text, pages joined. Line breaks preserved — resume parsing depends on them. */
  text: string;
  lowerText: string;
  /** Every non-empty line across the document, trimmed, in reading order. */
  lines: string[];
  pages: ExtractedPage[];
  /** Null when the format has no pagination (DOCX reflows, images are one canvas). */
  pageCount: number | null;
  wordCount: number;
  /** URLs from link annotations and hyperlink relationships, plus any found in text. */
  links: string[];
  /** True when at least one link is a real clickable annotation, not just printed text. */
  hasClickableLinks: boolean;
  imageCount: number;
  /** Document metadata, where the format carries it. */
  title: string | null;
  author: string | null;
  /** The tool that produced the file — Canva, Word, LaTeX, InDesign… */
  producer: string | null;
  /**
   * Semantic HTML, when the format carries structure. DOCX gives real headings, which
   * is stronger evidence of sections than any text heuristic. Null for PDF and images.
   */
  html: string | null;
  /** 0-100 for OCR, null otherwise. */
  ocrConfidence: number | null;
  warnings: string[];
}

export class ExtractError extends Error {
  readonly code: string;
  readonly suggestion: string | null;

  constructor(code: string, message: string, suggestion: string | null = null) {
    super(message);
    this.name = "ExtractError";
    this.code = code;
    this.suggestion = suggestion;
  }
}

/** Whitespace-collapse a single line without destroying the line itself. */
export function tidyLine(input: string): string {
  return input.replace(/[ \t   ]+/g, " ").trim();
}

/** Split extracted text into the non-empty lines the analyzers walk. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(tidyLine)
    .filter((line) => line.length > 0);
}

export function countWords(text: string): number {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.split(" ").length : 0;
}

/**
 * URLs printed as text. Uploaded documents are full of them — a resume's LinkedIn line
 * is usually typed, not linked — so the analyzers have to see both these and the real
 * annotations, while still being able to tell them apart.
 */
const URL_IN_TEXT =
  /\b((?:https?:\/\/|www\.)[^\s<>"'\]),]+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|co|me|art|design|studio|xyz|app|site|page|uk|ca|au|de|fr|nl|in|ng|ph)(?:\/[^\s<>"'\]),]*)?)/gi;

export function findUrlsInText(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(URL_IN_TEXT)) {
    // "ada@example.com" contains a perfectly good bare domain. Anything sitting
    // directly after an @ is the tail of an address, not a link to somewhere.
    if (match.index !== undefined && text[match.index - 1] === "@") continue;

    let candidate = match[0].replace(/[.,;:)\]]+$/, "");
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const url = new URL(candidate);
      if (url.hostname.includes(".")) out.add(url.href);
    } catch {
      // Not salvageable as a URL; ignore it.
    }
  }
  return [...out];
}
