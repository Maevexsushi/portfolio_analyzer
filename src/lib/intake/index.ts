import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { ExtractError, type ExtractedDocument, type SourceFormat } from "./types";

export { ExtractError } from "./types";
export type {
  ExtractedDocument,
  ExtractedPage,
  SourceFormat,
  TextOrigin,
} from "./types";
export { readStructure } from "./docx";

/**
 * Format dispatch for uploaded files.
 *
 * The format is decided by the bytes, not by the extension and not by the browser's
 * declared MIME type. Both of those are attacker-controlled and, far more often, simply
 * wrong: people rename `.doc` to `.docx` and expect it to work, and phones hand over
 * `application/octet-stream` for a perfectly good JPEG. Sniffing the header gets the
 * honest cases right and gives the dishonest ones nothing.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** What the file input advertises. Kept next to the sniffing so the two cannot drift. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"] as const;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * A .docx is a zip, and so is every other Office format, so the zip signature alone is
 * not enough — the archive has to actually contain a Word document part.
 */
function looksLikeDocx(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  // The part name appears in the local file headers, near the front of the archive.
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 8192))).toString("latin1");
  return head.includes("word/") || head.includes("[Content_Types].xml");
}

export function sniffFormat(bytes: Uint8Array): SourceFormat | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (looksLikeDocx(bytes)) return "docx";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image"; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  // WEBP is "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image"; // GIF
  if (startsWith(bytes, [0x42, 0x4d])) return "image"; // BMP
  return null;
}

/** The specific, actionable refusal for a format we recognise but cannot use. */
function rejectKnownUnsupported(bytes: Uint8Array, fileName: string): never {
  const lower = fileName.toLowerCase();

  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ExtractError(
      "legacy-office",
      "That is a legacy Word .doc file, which is a completely different format from .docx and cannot be read here.",
      "Open it and use Save As → PDF. Send employers the PDF too — .doc renders differently on every machine.",
    );
  }
  if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) {
    throw new ExtractError("rtf", "RTF files are not supported.", "Export to PDF and upload that.");
  }
  if (lower.endsWith(".pages")) {
    throw new ExtractError(
      "pages",
      "Apple Pages files cannot be read here — and most employers cannot open them either.",
      "In Pages, use File → Export To → PDF.",
    );
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    throw new ExtractError(
      "plain-text",
      "Plain text files are not accepted, because half of what this checks is how the document is put together.",
      "Export a PDF from whatever you write in.",
    );
  }

  throw new ExtractError(
    "unsupported",
    `"${fileName}" is not a format this can read. Accepted: PDF, DOCX, PNG, JPG, WEBP.`,
    "A PDF export is the safest thing to upload, and the safest thing to send an employer.",
  );
}

export interface UploadedFile {
  fileName: string;
  bytes: Uint8Array;
}

/** Read an uploaded file into the one shape every analyzer downstream understands. */
export async function extractDocument(file: UploadedFile): Promise<ExtractedDocument> {
  const { bytes, fileName } = file;

  if (bytes.byteLength === 0) {
    throw new ExtractError("empty", "That file is empty.");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ExtractError(
      "too-large",
      `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, over the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`,
      "A portfolio this heavy will also bounce off employer mail servers, which usually cap attachments at 10 MB. Export it again at a lower image quality.",
    );
  }

  const format = sniffFormat(bytes);
  if (!format) rejectKnownUnsupported(bytes, fileName);

  switch (format) {
    case "pdf":
      return extractPdf(bytes, fileName);
    case "docx":
      return extractDocx(bytes, fileName);
    case "image":
      return extractImage(bytes, fileName);
  }
}
