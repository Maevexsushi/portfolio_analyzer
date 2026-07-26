import { describe, expect, it } from "vitest";
import { extractDocument } from "@/lib/intake";
import { analyzeAts } from "@/lib/document/ats";
import { analyzePresentation } from "@/lib/document/work";
import { statusOf } from "./helpers";
import { STRONG_RESUME, makeDocx, makeTextPdf } from "./doc-helpers";

/*
 * PDF accessibility signals: whether the file declares itself tagged, and whether it
 * names a language. Both are read straight off the PDF's own catalog (MarkInfo, /Lang),
 * not inferred from the text, so the honest baseline for anything built by a plain
 * export path (this project's own fixtures included) is "untagged, no language" —
 * exactly what most real-world resumes look like unless the author went out of their
 * way to use an accessible export.
 */

describe("PDF accessibility signals", () => {
  it("reads an untagged, language-less PDF as the honest default", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.pdf",
      bytes: await makeTextPdf(STRONG_RESUME),
    });

    expect(document.accessibility).toEqual({ tagged: false, language: null });
  });

  it("reads a declared MarkInfo.Marked flag as tagged", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.pdf",
      bytes: await makeTextPdf(STRONG_RESUME, undefined, { tagged: true }),
    });

    expect(document.accessibility?.tagged).toBe(true);
  });

  it("reads a declared /Lang", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.pdf",
      bytes: await makeTextPdf(STRONG_RESUME, undefined, { language: "en-US" }),
    });

    expect(document.accessibility?.language).toBe("en-US");
  });

  it("has no accessibility signal at all for a .docx", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.docx",
      bytes: makeDocx([{ text: "ADA OKONKWO", heading: 1 }, { text: STRONG_RESUME }]),
    });

    expect(document.accessibility).toBeNull();
  });
});

describe("machine readability folds in the tagging and language checks", () => {
  it("warns on both when the PDF is untagged and language-less", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.pdf",
      bytes: await makeTextPdf(STRONG_RESUME),
    });
    const report = analyzeAts(document);

    expect(statusOf(report.checks, "ats-tagged-pdf")).toBe("warn");
    expect(statusOf(report.checks, "ats-pdf-language")).toBe("warn");
  });

  it("passes both once the PDF is tagged and names a language", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.pdf",
      bytes: await makeTextPdf(STRONG_RESUME, undefined, { tagged: true, language: "en-US" }),
    });
    const report = analyzeAts(document);

    expect(statusOf(report.checks, "ats-tagged-pdf")).toBe("pass");
    expect(statusOf(report.checks, "ats-pdf-language")).toBe("pass");
  });

  it("skips both checks entirely for a .docx, which has no such property", async () => {
    const document = await extractDocument({
      fileName: "ada-okonkwo-resume.docx",
      bytes: makeDocx([{ text: STRONG_RESUME }]),
    });
    const report = analyzeAts(document);

    expect(report.checks.find((c) => c.id === "ats-tagged-pdf")).toBeUndefined();
    expect(report.checks.find((c) => c.id === "ats-pdf-language")).toBeUndefined();
  });
});

describe("presentation folds in the same tagging and language checks for portfolio PDFs", () => {
  it("warns on an untagged portfolio PDF", async () => {
    const document = await extractDocument({
      fileName: "portfolio.pdf",
      bytes: await makeTextPdf("A portfolio page with enough words on it to not be empty."),
    });
    const report = analyzePresentation(document);

    expect(statusOf(report.checks, "presentation-tagged-pdf")).toBe("warn");
    expect(statusOf(report.checks, "presentation-pdf-language")).toBe("warn");
  });

  it("passes once the portfolio PDF is tagged and names a language", async () => {
    const document = await extractDocument({
      fileName: "portfolio.pdf",
      bytes: await makeTextPdf(
        "A portfolio page with enough words on it to not be empty.",
        undefined,
        { tagged: true, language: "en-GB" },
      ),
    });
    const report = analyzePresentation(document);

    expect(statusOf(report.checks, "presentation-tagged-pdf")).toBe("pass");
    expect(statusOf(report.checks, "presentation-pdf-language")).toBe("pass");
  });
});
