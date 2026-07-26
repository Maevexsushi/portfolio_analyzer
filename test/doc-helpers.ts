import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * Document fixtures, synthesised at test time.
 *
 * Committing binary fixtures would make the accuracy cases unreadable in review — a
 * diff on a PDF says nothing — and would tie the suite to files nobody can edit. Both
 * builders here produce real, spec-valid files from plain text, so a test case reads as
 * the resume it is testing.
 *
 * The .docx writer is a store-only ZIP written by hand rather than a dependency. It is
 * about forty lines because uncompressed ZIP entries need no deflate, and mammoth reads
 * them exactly as it reads Word's own output.
 */

export interface PdfPageSpec {
  lines: string[];
  /** Points. Defaults to A4 portrait. */
  width?: number;
  height?: number;
}

export async function makePdf(pages: PdfPageSpec[], title?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const spec of pages) {
    const page = doc.addPage([spec.width ?? 595, spec.height ?? 842]);
    spec.lines.forEach((line, index) => {
      page.drawText(line, {
        x: 48,
        y: (spec.height ?? 842) - 60 - index * 16,
        size: 10,
        font,
      });
    });
  }

  return doc.save();
}

/** Single-page PDF from a block of text — the common case. */
export function makeTextPdf(text: string, title?: string): Promise<Uint8Array> {
  return makePdf([{ lines: text.split("\n") }], title);
}

/* ----------------------------------- docx ------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function storedZip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 8); // stored, no compression
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, centralBuf, end]);
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DocxBlock {
  text: string;
  /** 1-4 renders as a real Word heading style; omit for a body paragraph. */
  heading?: number;
}

export function makeDocx(blocks: DocxBlock[]): Uint8Array {
  const body = blocks
    .map((block) => {
      const style = block.heading
        ? `<w:pPr><w:pStyle w:val="Heading${block.heading}"/></w:pPr>`
        : "";
      return `<w:p>${style}<w:r><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
    })
    .join("");

  return new Uint8Array(
    storedZip({
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    }),
  );
}

/** A complete, well-formed resume. Individual tests degrade a copy of it. */
export const STRONG_RESUME = `ADA OKONKWO
ada.okonkwo@example.com | +44 7700 900123 | London, UK
linkedin.com/in/adaokonkwo | github.com/adaokonkwo

SUMMARY
Backend engineer with six years building payment infrastructure. Looking for a senior role on a payments or platform team.

EXPERIENCE
Senior Backend Engineer, Monzo, 2021 - Present
- Cut settlement latency 43% by rewriting the reconciliation service in Go.
- Led a team of 4 engineers through two regulatory deadlines.
- Reduced on-call pages from 30 to 4 per month by adding idempotency keys.

Backend Engineer, Starling Bank, 2018 - 2021
- Built the ledger API handling 1,200 transactions per second at peak.
- Migrated 40 services from Jenkins to GitHub Actions.

EDUCATION
BSc Computer Science, UCL, 2018

SKILLS
Go, TypeScript, PostgreSQL, Kubernetes, Docker, AWS, Terraform, GraphQL

CERTIFICATIONS
AWS Certified Solutions Architect, 2022`;
