import type { ExtractedDocument } from "@/lib/intake";

/**
 * Resume or portfolio?
 *
 * The two get judged by almost disjoint sets of checks, so guessing wrong produces a
 * confidently wrong report — a photographer's twenty-page lookbook told to add
 * quantified bullet points, or a resume marked down for having no case studies. That
 * makes this the highest-stakes inference in the upload path, and the reason the answer
 * is always shown to the user with a one-click override next to it.
 *
 * The signals that actually separate them are structural rather than topical. Resumes
 * are short, dense with dates, and use a settled set of section names. Portfolios are
 * long, image-heavy, and carry very little text per page.
 */

export type DocumentKind = "resume" | "document";

export interface Classification {
  kind: DocumentKind;
  confidence: number;
  reasons: string[];
}

const RESUME_HEADINGS =
  /^(work |professional |employment )?(experience|employment history)\b|^education\b|^(technical |core |key )?skills?\b|^(professional )?summary\b|^certifications?\b|^references\b/im;

const RESUME_WORDS =
  /\b(curriculum vitae|\bcv\b|\bresume\b|employment history|references available|bachelor|master'?s|degree|graduated)\b/i;

const PORTFOLIO_WORDS =
  /\b(case stud|selected works?|portfolio|lookbook|showreel|my work|recent work|the brief|the challenge|the solution)\b/i;

export function classifyDocument(document: ExtractedDocument): Classification {
  const reasons: string[] = [];
  let resumeScore = 0;
  let portfolioScore = 0;

  const pageCount = document.pageCount;
  const pages = Math.max(1, document.pages.length);
  const wordsPerPage = document.wordCount / pages;
  const imagesPerPage = document.imageCount / pages;

  if (pageCount !== null) {
    if (pageCount <= 3) {
      resumeScore += 4;
      reasons.push(`${pageCount} page${pageCount === 1 ? "" : "s"}`);
    } else if (pageCount >= 8) {
      portfolioScore += 4;
      reasons.push(`${pageCount} pages`);
    }
  }

  if (RESUME_HEADINGS.test(document.text)) {
    resumeScore += 5;
    reasons.push("resume section headings");
  }
  if (RESUME_WORDS.test(document.text)) {
    resumeScore += 3;
    reasons.push("resume vocabulary");
  }
  if (PORTFOLIO_WORDS.test(document.text)) {
    portfolioScore += 4;
    reasons.push("case-study vocabulary");
  }

  // Date density: a resume is a chronology, a portfolio rarely is.
  const years = (document.text.match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? []).length;
  if (years >= 4 && wordsPerPage > 150) {
    resumeScore += 3;
    reasons.push(`${years} dates`);
  }

  if (imagesPerPage >= 2 && wordsPerPage < 120) {
    portfolioScore += 4;
    reasons.push("image-led pages with little text");
  }
  if (wordsPerPage > 250) {
    resumeScore += 2;
    reasons.push("text-dense pages");
  }

  /*
   * An image upload is a single page and can be either. Defaulting it to a portfolio
   * would tell someone who photographed their CV that it has no case studies, so the
   * text decides on its own and the structural signals sit this one out.
   */
  if (document.format === "image") {
    resumeScore += RESUME_HEADINGS.test(document.text) ? 3 : 0;
    portfolioScore += PORTFOLIO_WORDS.test(document.text) ? 3 : 0;
  }

  const total = resumeScore + portfolioScore;
  if (total === 0) {
    // Nothing to go on. A short file is more likely a resume than a portfolio.
    const kind: DocumentKind = (pageCount ?? 1) <= 3 ? "resume" : "document";
    return { kind, confidence: 20, reasons: ["no strong signals either way"] };
  }

  const kind: DocumentKind = resumeScore >= portfolioScore ? "resume" : "document";
  const winner = Math.max(resumeScore, portfolioScore);
  const confidence = Math.round((winner / total) * Math.min(100, 45 + winner * 6));

  return { kind, confidence: Math.min(100, confidence), reasons };
}
