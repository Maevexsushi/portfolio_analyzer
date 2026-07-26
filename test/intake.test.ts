import { describe, expect, it } from "vitest";
import { extractDocument, sniffFormat } from "@/lib/intake";
import { ExtractError } from "@/lib/intake/types";
import { findUrlsInText } from "@/lib/intake/types";
import { STRONG_RESUME, makeDocx, makePdf, makeTextPdf } from "./doc-helpers";

/*
 * Intake is where an uploaded file stops being bytes and becomes something the checks
 * can reason about, so the cases that matter are the ones where getting it wrong would
 * make every downstream finding wrong: the format, the fidelity of the text, and
 * whether structure survived.
 */

describe("format sniffing", () => {
  it("reads the format from the bytes, not the extension", async () => {
    const pdf = await makeTextPdf("hello");
    expect(sniffFormat(pdf)).toBe("pdf");
    expect(sniffFormat(makeDocx([{ text: "hi" }]))).toBe("docx");
    expect(sniffFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image",
    );
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image");
  });

  /*
   * A .docx is a zip and so is a .xlsx, a .pptx, and a .jar. Trusting the zip signature
   * alone would hand a spreadsheet to the Word parser and report a corrupt resume.
   */
  it("does not mistake an arbitrary zip for a Word document", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0x61, 0x62, 0x63]);
    expect(sniffFormat(zip)).toBeNull();
  });

  it("names the format when it recognises one it cannot use", async () => {
    // A legacy .doc is an OLE compound file, not a zip.
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(
      extractDocument({ fileName: "cv.doc", bytes: doc }),
    ).rejects.toMatchObject({ code: "legacy-office" });
  });

  it("rejects an empty file rather than reporting an empty resume", async () => {
    await expect(
      extractDocument({ fileName: "cv.pdf", bytes: new Uint8Array(0) }),
    ).rejects.toBeInstanceOf(ExtractError);
  });
});

describe("pdf extraction", () => {
  it("keeps line structure, which every resume rule depends on", async () => {
    const bytes = await makeTextPdf(STRONG_RESUME);
    const document = await extractDocument({ fileName: "ada.pdf", bytes });

    expect(document.format).toBe("pdf");
    expect(document.origin).toBe("embedded");
    expect(document.lines).toContain("EXPERIENCE");
    expect(document.lines).toContain("EDUCATION");
    expect(document.lines.some((line) => line.startsWith("- Cut settlement latency"))).toBe(true);
  });

  it("counts pages and reads geometry", async () => {
    const bytes = await makePdf([
      { lines: ["Brand identity for Northwind Coffee", "Rebrand across packaging and store"] },
      { lines: ["Editorial layout for Field Notes quarterly"], width: 842, height: 595 },
    ]);
    const document = await extractDocument({ fileName: "deck.pdf", bytes });

    expect(document.pageCount).toBe(2);
    expect(document.pages[1].width).toBeGreaterThan(document.pages[1].height!);
  });

  /*
   * A visual portfolio legitimately has near-empty pages — a full-bleed image with a
   * two-word caption is the form working. Rejecting the file for that would turn away
   * exactly the people the upload path was added for, so the no-text-layer refusal is
   * judged across the whole document.
   */
  it("accepts a deck with sparse pages as long as the document has text", async () => {
    const bytes = await makePdf([
      { lines: ["Selected work 2024", "Priya Raman, brand designer, Manchester"] },
      { lines: ["Northwind Coffee"] },
      { lines: [] },
    ]);
    const document = await extractDocument({ fileName: "deck.pdf", bytes });

    expect(document.pageCount).toBe(3);
    expect(document.warnings.join(" ")).toContain("contain no readable text");
  });

  /*
   * The single most valuable thing this tool tells a resume author is "no machine can
   * read this". A PDF of pure imagery has to fail loudly with the fix attached, not
   * come back as a resume that happens to score zero on everything.
   */
  it("refuses a PDF with no text layer and says why", async () => {
    const blank = await makePdf([{ lines: [] }, { lines: [] }]);
    await expect(
      extractDocument({ fileName: "scan.pdf", bytes: blank }),
    ).rejects.toMatchObject({ code: "no-text-layer" });
  });

  it("finds URLs printed as text, and does not mistake an email domain for one", async () => {
    const bytes = await makeTextPdf(
      "Ada Okonkwo, backend engineer based in London\nada@example.com\nportfolio: adaokonkwo.dev\nhttps://github.com/ada",
    );
    const document = await extractDocument({ fileName: "ada.pdf", bytes });

    expect(document.links).toContain("https://github.com/ada");
    expect(document.links.some((url) => url.includes("adaokonkwo.dev"))).toBe(true);
    expect(document.links.some((url) => url.includes("example.com"))).toBe(false);
  });
});

describe("url detection in text", () => {
  it("ignores the domain half of an email address", () => {
    expect(findUrlsInText("write to me at priya@studio.design")).toEqual([]);
  });

  it("keeps a bare domain that is a real link", () => {
    expect(findUrlsInText("see priya.studio for more")).toEqual(["https://priya.studio/"]);
  });

  it("strips trailing sentence punctuation", () => {
    expect(findUrlsInText("Visit https://example.com/work.")).toEqual(["https://example.com/work"]);
  });
});

describe("docx extraction", () => {
  it("uses real heading styles as structure", async () => {
    const bytes = makeDocx([
      { text: "Priya Raman", heading: 1 },
      { text: "priya@example.com | Manchester" },
      { text: "Experience", heading: 2 },
      { text: "Content Designer, Monzo, 2021 - Present" },
    ]);
    const document = await extractDocument({ fileName: "priya.docx", bytes });

    expect(document.format).toBe("docx");
    expect(document.html).toContain("<h2>Experience</h2>");
    expect(document.lines).toContain("Experience");
  });

  /*
   * Cheerio's .text() runs block elements together, so "ExperienceContent Designer"
   * would arrive as one line and every heading rule would miss. Block boundaries have
   * to survive the flattening.
   */
  it("keeps a heading and the paragraph under it on separate lines", async () => {
    const bytes = makeDocx([
      { text: "Experience", heading: 2 },
      { text: "Content Designer, Monzo" },
    ]);
    const document = await extractDocument({ fileName: "p.docx", bytes });

    expect(document.lines).toContain("Experience");
    expect(document.lines).toContain("Content Designer, Monzo");
  });

  it("says plainly that a .docx has no pages to check", async () => {
    const document = await extractDocument({
      fileName: "p.docx",
      bytes: makeDocx([{ text: "Priya Raman" }, { text: "Experience", heading: 2 }]),
    });

    expect(document.pageCount).toBeNull();
    expect(document.warnings.join(" ")).toContain("no fixed pages");
  });
});
