import mammoth from "mammoth";
import * as cheerio from "cheerio";
import {
  ExtractError,
  countWords,
  findUrlsInText,
  toLines,
  type ExtractedDocument,
} from "./types";

/**
 * DOCX extraction, via mammoth.
 *
 * Converting to HTML rather than raw text is the whole reason this path is worth
 * having. Word documents carry real heading styles, real lists, and real hyperlink
 * relationships, so "does this resume have an Experience section" stops being a text
 * heuristic and becomes a fact read off an `<h2>`. That structure is better evidence
 * than anything the PDF path can recover.
 *
 * What it cannot give is pagination: a .docx reflows to whatever renders it, so page
 * count is null here and every page-based check has to say so rather than guess.
 */

/** Word emits deeply nested styles; only the outline levels tell us anything. */
const HEADING_SELECTOR = "h1, h2, h3, h4";

export interface DocxStructure {
  /** Heading text in document order, with their outline level. */
  headings: { level: number; text: string }[];
  /** Number of list items — bullet density is the core resume-experience signal. */
  listItems: number;
  paragraphs: number;
}

export function readStructure(html: string): DocxStructure {
  const $ = cheerio.load(html);
  const headings = $(HEADING_SELECTOR)
    .map((_, el) => ({
      level: Number((el as { tagName?: string }).tagName?.replace(/\D/g, "")) || 4,
      text: $(el).text().replace(/\s+/g, " ").trim(),
    }))
    .get()
    .filter((heading) => heading.text.length > 0);

  return {
    headings,
    listItems: $("li").length,
    paragraphs: $("p").length,
  };
}

export async function extractDocx(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  const buffer = Buffer.from(bytes);

  let html: string;
  let messages: { type: string; message: string }[];
  try {
    const converted = await mammoth.convertToHtml({ buffer });
    html = converted.value;
    messages = converted.messages as { type: string; message: string }[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/end of central directory|zip/i.test(message)) {
      throw new ExtractError(
        "corrupt",
        "That file is not a readable .docx. Word's older .doc format is a different format entirely and cannot be read here.",
        "Open it in Word or Google Docs and export as PDF — that is what you should be sending employers anyway.",
      );
    }
    throw new ExtractError("corrupt", `That .docx could not be read: ${message}`);
  }

  const $ = cheerio.load(html);
  const links = new Set<string>();
  let hasClickableLinks = false;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (href && /^https?:\/\//i.test(href)) {
      links.add(href);
      hasClickableLinks = true;
    }
  });
  const imageCount = $("img").length;

  /*
   * Block elements have to become line breaks before the text is flattened. Cheerio's
   * `.text()` would run a heading straight into the paragraph under it, and every
   * section-detection rule downstream reads one line at a time.
   */
  const withBreaks = html
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = toLines(cheerio.load(withBreaks).root().text()).join("\n");

  if (countWords(text) === 0) {
    throw new ExtractError("empty", "That document contains no readable text.");
  }

  for (const url of findUrlsInText(text)) links.add(url);

  const warnings: string[] = [];
  if (messages.some((message) => message.type === "warning")) {
    const unsupported = messages.filter((m) => m.type === "warning").length;
    warnings.push(
      `${unsupported} formatting feature${unsupported === 1 ? "" : "s"} in this .docx could not be read (text boxes, embedded objects, or unusual styles). Anything inside them was skipped — which is also roughly what an applicant tracking system does with them.`,
    );
  }
  warnings.push(
    "A .docx has no fixed pages — it reflows to whatever opens it — so page-count checks were skipped. Export to PDF to have those checked, and to control what an employer actually sees.",
  );

  const lines = toLines(text);

  return {
    format: "docx",
    origin: "embedded",
    fileName,
    bytes: bytes.byteLength,
    text,
    lowerText: text.toLowerCase(),
    lines,
    pages: [
      {
        number: 1,
        text,
        lines,
        wordCount: countWords(text),
        width: null,
        height: null,
        imageCount,
      },
    ],
    pageCount: null,
    wordCount: countWords(text),
    links: [...links],
    hasClickableLinks,
    imageCount,
    title: null,
    author: null,
    producer: "Microsoft Word (.docx)",
    html,
    ocrConfidence: null,
    accessibility: null,
    warnings,
  };
}
