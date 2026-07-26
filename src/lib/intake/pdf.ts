import { extractText, getDocumentProxy } from "unpdf";
import {
  ExtractError,
  countWords,
  findUrlsInText,
  toLines,
  type ExtractedDocument,
  type ExtractedPage,
} from "./types";

/**
 * PDF extraction, via pdf.js (through unpdf's serverless build).
 *
 * The text layer is the point. A PDF exported from Word, Figma, or LaTeX carries the
 * characters as data, which is what both a human's Ctrl-F and an applicant tracking
 * system read. A PDF that is really a photograph of a page carries none, and looks
 * identical to a person. Distinguishing those two is the single most useful thing this
 * module does, so a page yielding no text is recorded rather than quietly skipped.
 */

/** Below this, a page is text-empty for practical purposes — a header or a page number. */
const MIN_WORDS_PER_TEXT_PAGE = 3;

/**
 * Below this the document as a whole has nothing worth analyzing.
 *
 * Judged across the document rather than per page. A portfolio deck legitimately has
 * near-empty pages — a full-bleed image with a two-word caption is the form working as
 * intended — and refusing the whole file because one page is sparse would reject
 * exactly the documents this feature was added to serve.
 */
const MIN_WORDS_FOR_TEXT_LAYER = 10;

interface PdfInfo {
  Title?: unknown;
  Author?: unknown;
  Producer?: unknown;
  Creator?: unknown;
}

function metaString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function extractPdf(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  let proxy: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    proxy = await getDocumentProxy(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypt/i.test(message)) {
      throw new ExtractError(
        "encrypted",
        "That PDF is password-protected, so its contents cannot be read.",
        "Save an unprotected copy and upload that — an employer's system cannot open it either.",
      );
    }
    throw new ExtractError("corrupt", `That PDF could not be opened: ${message}`);
  }

  const pageCount = proxy.numPages;
  if (pageCount === 0) throw new ExtractError("empty", "That PDF has no pages.");

  const warnings: string[] = [];
  const { text: pageTexts } = await extractText(proxy, { mergePages: false });

  const pages: ExtractedPage[] = [];
  const links = new Set<string>();
  let hasClickableLinks = false;
  let imageCount = 0;

  for (let number = 1; number <= pageCount; number++) {
    const raw = String(pageTexts[number - 1] ?? "");
    const lines = toLines(raw);

    let width: number | null = null;
    let height: number | null = null;
    let pageImages = 0;

    try {
      const page = await proxy.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      width = viewport.width;
      height = viewport.height;

      for (const annotation of await page.getAnnotations()) {
        const record = annotation as { url?: unknown; unsafeUrl?: unknown };
        const url = metaString(record.url) ?? metaString(record.unsafeUrl);
        if (url) {
          links.add(url);
          hasClickableLinks = true;
        }
      }

      // Counting XObject images is the only way to tell a visual portfolio page from a
      // wall of text, and it is what makes "your work is all screenshots" checkable.
      const operators = await page.getOperatorList();
      for (const op of operators.fnArray as number[]) {
        // 85 paintImageXObject, 86 paintInlineImageXObject, 87 paintImageMaskXObject.
        if (op === 85 || op === 86 || op === 87) pageImages++;
      }
    } catch {
      // Geometry and annotations are enrichments; text already succeeded.
    }

    imageCount += pageImages;
    pages.push({
      number,
      text: lines.join("\n"),
      lines,
      wordCount: countWords(raw),
      width,
      height,
      imageCount: pageImages,
    });
  }

  const text = pages.map((page) => page.text).join("\n");
  const wordCount = pages.reduce((sum, page) => sum + page.wordCount, 0);
  const textPages = pages.filter((page) => page.wordCount >= MIN_WORDS_PER_TEXT_PAGE).length;

  /*
   * Two different problems with the same symptom, told apart because the fixes differ.
   * Zero words means the pages are images. A handful of words means the file is real
   * but nearly empty, and telling that author to "stop scanning it" would be wrong.
   */
  if (wordCount === 0) {
    throw new ExtractError(
      "no-text-layer",
      "That PDF contains no readable text — every page is an image. Applicant tracking systems and recruiters' search tools see exactly nothing in it.",
      "Export it again from the original design or document file rather than scanning or screenshotting it. If you only have the scan, upload it as a PNG or JPG instead and it will be run through OCR.",
    );
  }
  if (wordCount < MIN_WORDS_FOR_TEXT_LAYER) {
    throw new ExtractError(
      "no-text-layer",
      `Only ${wordCount} word${wordCount === 1 ? "" : "s"} could be read out of that PDF, which is not enough to review. Either the file is nearly empty, or almost everything in it is set as images.`,
      "If the text is there on screen but not here, it is baked into the artwork — and it is invisible to search and to every employer's system. Re-export with live text.",
    );
  }
  if (textPages < pageCount) {
    warnings.push(
      `${pageCount - textPages} of ${pageCount} pages contain no readable text — they are images. Anything written on those pages is invisible to search and to applicant tracking systems.`,
    );
  }

  let info: PdfInfo = {};
  try {
    info = ((await proxy.getMetadata()).info ?? {}) as PdfInfo;
  } catch {
    // Metadata is optional in the format and in this report.
  }

  let tagged = false;
  try {
    tagged = (await proxy.getMarkInfo())?.Marked === true;
  } catch {
    // Optional signal; an untagged file is the honest default when it cannot be read.
  }

  let language: string | null = null;
  try {
    // /Lang lives on the document catalog, so any page's text content carries the same
    // value — page 1 is read regardless of whether it has visible text.
    const page1 = await proxy.getPage(1);
    language = metaString((await page1.getTextContent()).lang);
  } catch {
    // Optional signal.
  }

  for (const url of findUrlsInText(text)) links.add(url);

  return {
    format: "pdf",
    origin: "embedded",
    fileName,
    bytes: bytes.byteLength,
    text,
    lowerText: text.toLowerCase(),
    lines: pages.flatMap((page) => page.lines),
    pages,
    pageCount,
    wordCount,
    links: [...links],
    hasClickableLinks,
    imageCount,
    title: metaString(info.Title),
    author: metaString(info.Author),
    producer: metaString(info.Producer) ?? metaString(info.Creator),
    html: null,
    ocrConfidence: null,
    accessibility: { tagged, language },
    warnings,
  };
}
