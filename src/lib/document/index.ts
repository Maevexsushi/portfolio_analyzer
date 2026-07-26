import { randomUUID } from "node:crypto";
import { AiError, isAiConfigured } from "@/lib/ai/groq";
import { isEmptyReview, reviewDocument } from "@/lib/ai/review";
import { isEmptyRewrite, rewriteResume } from "@/lib/ai/rewrite";
import { detectDiscipline } from "@/lib/discipline/detect";
import { profileFor } from "@/lib/discipline/profiles";
import { analyzeJobMatch, guessCompanyName, guessJobTitle } from "@/lib/jobmatch";
import { draftCoverLetter, isEmptyCoverLetterDraft } from "@/lib/ai/coverletter";
import { analyzeCoverLetter } from "./coverletter";
import {
  composeVocabulary,
  matchSkills,
  skillsRegionFromLines,
  summariseSkills,
} from "@/lib/discipline/skills";
import {
  DOCUMENT_WEIGHTS,
  RESUME_WEIGHTS,
  breakdownFrom,
  gradeFor,
  overallScore,
} from "@/lib/analyzer/score";
import { extractDocument, type ExtractedDocument, type UploadedFile } from "@/lib/intake";
import type {
  AiReview,
  AnalyzeFileOptions,
  CoverLetterDraft,
  CoverLetterReport,
  DocumentResult,
  JobMatchReport,
  ResumeResult,
  ResumeRewrite,
  SkillsReport,
  UploadInfo,
} from "@/lib/types";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { analyzeAts } from "./ats";
import { classifyDocument, type DocumentKind } from "./classify";
import { analyzeContact } from "./contact";
import { analyzeExperience } from "./experience";
import { analyzeLanguage } from "./language";
import { analyzeResumeStructure } from "./sections";
import { generateDocumentSuggestions } from "./suggestions";
import { analyzeDeliverability, analyzeDocumentWork, analyzePresentation } from "./work";

export { ExtractError } from "@/lib/intake";
export { classifyDocument } from "./classify";

/**
 * The upload pipeline.
 *
 * Extract once, work out what the file is and what field it belongs to, then run the
 * checks for that combination. The two branches share extraction, discipline detection,
 * contact, and skills; everything below that differs, because a resume and a portfolio
 * deck are only superficially the same object.
 */

const MAX_LINK_CHECKS = 15;

const AI_FAILURE_NOTE: Record<string, string> = {
  auth: "The AI review was skipped: the Groq API rejected the configured key.",
  "rate-limit":
    "The AI review was skipped: the Groq API rate limit was hit. Re-run in a minute to get it.",
  timeout: "The AI review was skipped: the model did not answer in time.",
  malformed: "The AI review was skipped: the model returned a response we could not read.",
  empty: "The AI review was skipped: the model returned nothing.",
};

function uploadInfo(document: ExtractedDocument): UploadInfo {
  return {
    fileName: document.fileName,
    format: document.format,
    bytes: document.bytes,
    pageCount: document.pageCount,
    textOrigin: document.origin,
    ocrConfidence: document.ocrConfidence,
  };
}

function skillsFor(document: ExtractedDocument, profile: DisciplineProfile): SkillsReport {
  const declaredText = skillsRegionFromLines(document.lines);
  const hasSkillsSection = declaredText.trim().length > 0;
  const skills = matchSkills(document.lowerText, declaredText, composeVocabulary(profile));
  const summary = summariseSkills(skills, profile, hasSkillsSection);

  return {
    score: summary.score,
    total: skills.length,
    skills,
    categoriesCovered: summary.categoriesCovered,
    missingCategories: summary.missingCategories,
    hasSkillsSection,
    checks: summary.checks,
  };
}

function verdictForResume(score: number): string {
  if (score >= 90) return "Ready to send. This will survive both the parser and the seven-second skim.";
  if (score >= 80) return "Strong. A few targeted edits and it is done.";
  if (score >= 70) return "Solid, with gaps that are costing you interviews you would otherwise get.";
  if (score >= 55) return "Readable but underselling you. The content is there; the framing is not.";
  if (score >= 40) return "Needs real work before you send it anywhere.";
  return "Not ready. Start with whether a machine can read it at all.";
}

function verdictForDocument(score: number): string {
  if (score >= 90) return "Ready to send. It opens, it reads, and the work is explained.";
  if (score >= 80) return "Strong. Tighten the edit and it is done.";
  if (score >= 70) return "Good work, under-explained. The pieces need words around them.";
  if (score >= 55) return "A gallery more than a portfolio — a reviewer cannot tell what you did.";
  if (score >= 40) return "Needs substantial work before it helps your application.";
  return "Not ready to send. Start with whether it can be opened and read at all.";
}

/** Both branches degrade to `ai: null` plus a caveat; nothing here may fail the report. */
async function runAiReview(
  build: () => Promise<AiReview>,
  wanted: boolean,
  warnings: string[],
): Promise<AiReview | null> {
  if (!wanted) return null;
  try {
    const review = await build();
    if (isEmptyReview(review)) {
      warnings.push("The AI review came back empty and was dropped.");
      return null;
    }
    return review;
  } catch (error) {
    const code = error instanceof AiError ? error.code : "network";
    warnings.push(
      AI_FAILURE_NOTE[code] ??
        "The AI review was skipped: the model could not be reached. The rest of the report is unaffected.",
    );
    console.error("ai review failed", error);
    return null;
  }
}

export interface FileAnalysis {
  result: ResumeResult | DocumentResult;
  /** What the classifier decided, surfaced so the UI can offer the override. */
  detectedKind: DocumentKind;
  classificationConfidence: number;
  classificationReasons: string[];
}

export async function analyzeUpload(
  file: UploadedFile,
  options: AnalyzeFileOptions = {},
): Promise<FileAnalysis> {
  const startedAt = Date.now();
  const document = await extractDocument(file);

  const warnings = [...document.warnings];
  const classification = classifyDocument(document);
  const kind: DocumentKind = options.documentKind ?? classification.kind;

  const named = (k: DocumentKind) => (k === "resume" ? "a resume" : "a portfolio document");

  /*
   * Two different uncertainties, and they deserve different words.
   *
   * When nobody said what the file was, the classifier's own doubt is the story. When
   * someone did say — which is every upload from the site, since each tab pins a kind —
   * the classifier is no longer deciding anything. It stays useful only as a second
   * opinion: if it confidently reads the file as the other kind, that is worth saying,
   * because the two are scored against almost disjoint checks and the person is better
   * placed than the heuristic to settle it. The declared kind is still honoured.
   */
  if (!options.documentKind) {
    if (classification.confidence < 45) {
      warnings.push(
        `This was read as ${named(kind)}, but not confidently (${classification.confidence}%). If that is wrong, switch it — the two are scored against completely different expectations.`,
      );
    }
  } else if (classification.kind !== options.documentKind && classification.confidence >= 60) {
    warnings.push(
      `You uploaded this as ${named(options.documentKind)} and it has been scored as one, but it reads more like ${named(classification.kind)} (${classification.confidence}% — ${classification.reasons.join(", ")}). If you picked the wrong tab, the checks below are aimed at the wrong target.`,
    );
  }

  const discipline = detectDiscipline(document.text, { chosen: options.discipline ?? null });
  const profile = profileFor(discipline.key);
  const wantsAi = (options.aiReview ?? true) && isAiConfigured();

  const contact = analyzeContact(document, profile, { strict: kind === "resume" });
  const skills = skillsFor(document, profile);

  if (kind === "resume") {
    const structure = analyzeResumeStructure(document);
    const experience = analyzeExperience(document, profile);
    const ats = analyzeAts(document);
    const language = analyzeLanguage(document, { penaliseFirstPerson: true });

    const breakdown = breakdownFrom(RESUME_WEIGHTS, {
      experience: {
        score: experience.score,
        summary: `${experience.entries.length} role${experience.entries.length === 1 ? "" : "s"}, ${Math.round(experience.quantificationRate * 100)}% of bullets carry a number.`,
      },
      ats: {
        score: ats.score,
        summary: ats.machineReadable
          ? `${ats.standardHeadings.length} standard headings, text extracts cleanly.`
          : "No machine-readable text — invisible to applicant tracking systems.",
      },
      structure: {
        score: structure.score,
        summary: `${structure.requiredFound}/${structure.requiredTotal} expected sections present.`,
      },
      contact: {
        score: contact.score,
        summary: contact.email ? `Reachable at ${contact.email}.` : "No email address found.",
      },
      skills: {
        score: skills.score,
        summary: `${skills.total} skills across ${skills.categoriesCovered.length} groups.`,
      },
      language: {
        score: language.score,
        summary: `${language.wordCount} words, ${language.clicheHits.length} stock phrases.`,
      },
    });

    const overall = overallScore(breakdown);

    /*
     * Job matching. Kept out of overallScore/breakdown deliberately — see the type's
     * own doc comment — so it is computed after the score, not folded into it.
     */
    let jobMatch: JobMatchReport | null = null;
    const jobDescriptionText = (options.jobDescription ?? "").trim();
    if (jobDescriptionText.length > 0) {
      jobMatch = analyzeJobMatch({ jobDescriptionText, profile, resumeSkills: skills.skills });
    }
    // Reused by the cover letter below, so a JD only has to be parsed once.
    const jobTitleGuess = jobDescriptionText ? guessJobTitle(jobDescriptionText) : null;
    const companyNameGuess = jobDescriptionText ? guessCompanyName(jobDescriptionText) : null;

    /*
     * Cover letter review — deterministic, of a letter the author already wrote.
     * Uses the same job-title/company guesses as job matching so pasting one JD lights
     * up every feature that can use it.
     */
    let coverLetter: CoverLetterReport | null = null;
    const coverLetterText = (options.coverLetterText ?? "").trim();
    if (coverLetterText.length > 0) {
      coverLetter = analyzeCoverLetter({
        text: coverLetterText,
        jobTitle: jobTitleGuess,
        companyName: companyNameGuess,
      });
    }

    const suggestions = generateDocumentSuggestions(
      [
        contact.checks,
        structure.checks,
        experience.checks,
        skills.checks,
        ats.checks,
        language.checks,
        jobMatch?.checks ?? [],
        coverLetter?.checks ?? [],
      ],
      profile,
    );

    const ai = await runAiReview(
      () => reviewDocument({ kind: "resume", document, profile, contact, skills, experience }),
      wantsAi,
      warnings,
    );

    /*
     * The improved draft. Opt-in and separate from the review, because unlike every
     * other output this one *is* the author's content: it gets stored with the report
     * where the uploaded file never was, and it costs a second model call.
     */
    let rewrite: ResumeRewrite | null = null;
    if ((options.rewrite ?? false) && isAiConfigured()) {
      try {
        const draft = await rewriteResume({
          document,
          profile,
          contact,
          structure,
          experience,
          skills,
        });
        rewrite = isEmptyRewrite(draft) ? null : draft;
        if (!rewrite) {
          warnings.push("The improved draft came back empty and was dropped.");
        } else {
          if (draft.redactedCount > 0) {
            warnings.push(
              `The draft invented ${draft.redactedCount} number${draft.redactedCount === 1 ? "" : "s"} that is not in your resume; each has been replaced with a placeholder for you to fill in.`,
            );
          }
          if (draft.stockPhrases.length > 0) {
            warnings.push(
              `The draft reintroduced ${draft.stockPhrases.length} stock phrase${draft.stockPhrases.length === 1 ? "" : "s"} (${draft.stockPhrases.slice(0, 3).join(", ")}) — the same filler this report tells you to cut. Rewrite those lines in your own words.`,
            );
          }
        }
      } catch (error) {
        const code = error instanceof AiError ? error.code : "network";
        warnings.push(
          AI_FAILURE_NOTE[code]?.replace("AI review", "improved draft") ??
            "The improved draft was skipped: the model could not be reached.",
        );
        console.error("resume rewrite failed", error);
      }
    }

    /*
     * The cover letter draft. Same opt-in posture as the resume rewrite — it is the
     * author's own content, stored with the report, costs a model call — plus its own,
     * narrower guard: see coverletter.ts's module comment for exactly what it does and
     * does not verify.
     */
    let coverLetterDraft: CoverLetterDraft | null = null;
    if ((options.coverLetterDraft ?? false) && isAiConfigured()) {
      try {
        const draft = await draftCoverLetter({
          document,
          profile,
          contact,
          experience,
          skills,
          jobDescriptionText: jobDescriptionText || null,
          companyName: companyNameGuess,
          recipientName: null,
        });
        coverLetterDraft = isEmptyCoverLetterDraft(draft) ? null : draft;
        if (!coverLetterDraft) {
          warnings.push("The cover letter draft came back empty and was dropped.");
        } else if (draft.unverifiedSkills.length > 0) {
          warnings.push(
            `The draft mentions ${draft.unverifiedSkills.length} skill${draft.unverifiedSkills.length === 1 ? "" : "s"} (${draft.unverifiedSkills.slice(0, 3).join(", ")}) that were not found among your resume's own skills — this is not exhaustive fact-checking, so read the letter and confirm these are genuinely yours.`,
          );
        }
      } catch (error) {
        const code = error instanceof AiError ? error.code : "network";
        warnings.push(
          AI_FAILURE_NOTE[code]?.replace("AI review", "cover letter draft") ??
            "The cover letter draft was skipped: the model could not be reached.",
        );
        console.error("cover letter draft failed", error);
      }
    }

    return {
      result: {
        kind: "resume",
        focus: options.focus === "jobmatch" ? "jobmatch" : "full",
        id: randomUUID(),
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        overallScore: overall,
        grade: gradeFor(overall),
        verdict: verdictForResume(overall),
        upload: uploadInfo(document),
        discipline,
        breakdown,
        contact,
        structure,
        experience,
        skills,
        ats,
        language,
        suggestions,
        ai,
        rewrite,
        jobMatch,
        coverLetter,
        coverLetterDraft,
        warnings,
      },
      detectedKind: classification.kind,
      classificationConfidence: classification.confidence,
      classificationReasons: classification.reasons,
    };
  }

  const work = analyzeDocumentWork(document, profile);
  const presentation = analyzePresentation(document);
  const deliverability = await analyzeDeliverability(document, {
    checkLinks: options.checkLinks ?? false,
    maxLinkChecks: MAX_LINK_CHECKS,
  });

  const breakdown = breakdownFrom(DOCUMENT_WEIGHTS, {
    work: {
      score: work.score,
      summary:
        work.count === 0
          ? `No ${profile.workNoun.plural} could be identified.`
          : `${work.count} ${work.count === 1 ? profile.workNoun.singular : profile.workNoun.plural}, ${work.averageWords} words each on average.`,
    },
    presentation: {
      score: presentation.score,
      summary:
        presentation.pageCount === null
          ? "No fixed pagination in this format."
          : `${presentation.pageCount} pages, ${presentation.imagesPerPage} images per page.`,
    },
    contact: {
      score: contact.score,
      summary: contact.email ? `Reachable at ${contact.email}.` : "No email address found.",
    },
    deliverability: {
      score: deliverability.score,
      summary: `${(deliverability.bytes / 1024 / 1024).toFixed(1)} MB, ${deliverability.linkCount} links.`,
    },
    skills: {
      score: skills.score,
      summary: `${skills.total} skills across ${skills.categoriesCovered.length} groups.`,
    },
  });

  const overall = overallScore(breakdown);
  const suggestions = generateDocumentSuggestions(
    [contact.checks, work.checks, skills.checks, presentation.checks, deliverability.checks],
    profile,
  );

  const ai = await runAiReview(
    () => reviewDocument({ kind: "document", document, profile, contact, skills, work }),
    wantsAi,
    warnings,
  );

  return {
    result: {
      kind: "document",
      id: randomUUID(),
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      overallScore: overall,
      grade: gradeFor(overall),
      verdict: verdictForDocument(overall),
      upload: uploadInfo(document),
      discipline,
      breakdown,
      contact,
      work,
      skills,
      presentation,
      deliverability,
      suggestions,
      ai,
      warnings,
    },
    detectedKind: classification.kind,
    classificationConfidence: classification.confidence,
    classificationReasons: classification.reasons,
  };
}
