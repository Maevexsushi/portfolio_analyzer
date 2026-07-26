import path from "node:path";
import { createWorker } from "tesseract.js";
import {
  ExtractError,
  countWords,
  findUrlsInText,
  toLines,
  type ExtractedDocument,
} from "./types";

/**
 * Image extraction, via Tesseract OCR.
 *
 * This path exists because plenty of people export a portfolio page straight to PNG,
 * and refusing them would be exactly the exclusion this feature is meant to remove.
 * It is also the least trustworthy input the tool accepts, and the report has to say
 * so rather than present recognised text as if it were read.
 *
 * Two things follow from that. Confidence travels with the document, so the checks can
 * soften their claims when recognition was poor. And an image is treated as *evidence
 * of a problem* regardless of how well it reads: no employer's system can search it, no
 * recruiter can copy an email address out of it, and a link inside it is not clickable.
 * A clean render scores well here and still gets told to send a PDF.
 */

/** Below this the recognised text is guesswork and is reported as unreliable. */
const LOW_CONFIDENCE = 70;

/**
 * Hard ceiling on recognition.
 *
 * Recognising a clean page takes well under a second, so anything approaching this is
 * not slow but stuck — and a stuck OCR worker held a request open for five minutes in
 * testing, with the user watching a spinner the whole time. Failing at 60 seconds with
 * a message beats succeeding at five minutes.
 */
const OCR_TIMEOUT_MS = 60_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms).unref?.(),
    ),
  ]);
}

/** Model files land here rather than in the working directory. Gitignored. */
const CACHE_DIR = path.join(process.cwd(), ".tesseract-cache");

/**
 * One worker per process, created on first use.
 *
 * Spinning one up costs about a second and loading the language model costs more, so a
 * per-request worker would double the cost of every upload. The promise is cached
 * rather than the worker so concurrent requests share a single initialisation.
 */
let workerPromise: ReturnType<typeof createWorker> | null = null;

function ocrWorker(): ReturnType<typeof createWorker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      cachePath: CACHE_DIR,
      // tesseract.js logs per-frame progress; useful in a browser, noise in a server log.
      logger: () => {},
    });
    // A failed initialisation must not be cached forever — the next upload should retry.
    void workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

function resetWorker(): void {
  const stale = workerPromise;
  workerPromise = null;
  void stale?.then((worker) => worker.terminate()).catch(() => {});
}

export async function extractImage(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> {
  let text: string;
  let confidence: number;

  try {
    const worker = await withTimeout(ocrWorker(), OCR_TIMEOUT_MS, "OCR startup");
    const { data } = await withTimeout(
      worker.recognize(Buffer.from(bytes)),
      OCR_TIMEOUT_MS,
      "OCR",
    );
    text = data.text;
    confidence = Math.round(data.confidence);
  } catch (error) {
    // A failed run can leave the cached worker unusable; drop it so the next try is fresh.
    resetWorker();
    const message = error instanceof Error ? error.message : String(error);
    throw new ExtractError(
      "ocr-failed",
      `That image could not be read: ${message}`,
      "If this is a portfolio or resume, export it as a PDF instead — it will be read exactly rather than guessed at.",
    );
  }

  const lines = toLines(text);
  const clean = lines.join("\n");
  const wordCount = countWords(clean);

  if (wordCount < 3) {
    throw new ExtractError(
      "no-text",
      "No readable text could be recognised in that image.",
      "Upload a PDF, or an image at a higher resolution with the text large enough to read at full size.",
    );
  }

  const warnings: string[] = [
    "This is an image, so its text was recognised by OCR rather than read. Some of it will be wrong. Nothing in an image is searchable, selectable, or clickable — an applicant tracking system sees a blank document.",
  ];
  if (confidence < LOW_CONFIDENCE) {
    warnings.push(
      `Recognition confidence was ${confidence}%, which is low. Treat every quoted phrase in this report as approximate, and re-upload at a higher resolution for a reliable read.`,
    );
  }

  return {
    format: "image",
    origin: "ocr",
    fileName,
    bytes: bytes.byteLength,
    text: clean,
    lowerText: clean.toLowerCase(),
    lines,
    pages: [
      {
        number: 1,
        text: clean,
        lines,
        wordCount,
        width: null,
        height: null,
        imageCount: 1,
      },
    ],
    pageCount: 1,
    wordCount,
    links: findUrlsInText(clean),
    hasClickableLinks: false,
    imageCount: 1,
    title: null,
    author: null,
    producer: null,
    html: null,
    ocrConfidence: confidence,
    accessibility: null,
    warnings,
  };
}
