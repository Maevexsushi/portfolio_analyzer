import type { AiHighlight, CompanyBrief } from "@/lib/types";
import { chatJson } from "./groq";

/**
 * Company research briefing.
 *
 * The honest version of "tell me about this company before my interview." A model
 * asked that question from memory alone will answer from training data of unknown
 * age, for a company that may have changed its focus, its leadership, or its name
 * since — and there is no way for the reader to tell a stale fact from a current one.
 * This module never asks that question. It is handed the actual text of up to three
 * pages the company itself published — fetched here, not recalled — and is only ever
 * asked to summarise what is in front of it, the same "digest, not memory" rule
 * src/lib/ai/review.ts already applies to a portfolio. Every stated fact carries the
 * line of source text that backs it, exactly like that module's strengths/underselling
 * fields, because a company is a real entity with a real reputation and an unsupported
 * claim about one is a worse failure mode here than almost anywhere else in this app.
 *
 * What this cannot do, and does not pretend to: there is no search index and no news
 * feed behind it, so it has nothing to say about anything not printed on the pages it
 * was given. A company's own site rarely says "our engineering culture has a blame
 * problem" — this reads what the company publishes about itself, not an independent
 * account of it, and the panel says so.
 */

export interface CompanyPageDigest {
  url: string;
  title: string;
  description: string;
  text: string;
}

export interface CompanyBriefInput {
  pages: CompanyPageDigest[];
}

const MAX_PAGES = 3;
const MAX_TEXT_CHARS_PER_PAGE = 4000;

const SYSTEM_PROMPT = `You write a short interview-prep briefing from a company's own public web pages. You are given the extracted text of up to three pages it published about itself.

Rules that matter:
- Use only what is in the pages you were given. Do not add outside knowledge, do not guess at recent news, funding, leadership, or headcount unless it is literally stated on one of the pages.
- Every fact you state must carry the line or phrase from the source pages that backs it. If nothing in the pages supports a fact, do not state it.
- This is the company's own description of itself, not independent reporting — do not present it as neutral fact beyond what the company itself is claiming.
- Plain and specific. No marketing adjectives repeated back as if they were findings ("passionate," "innovative," "world-class") — if a page only offers that kind of language, say so rather than repeating it as a real signal.
- Thin source material is a real, honest outcome. If the pages have almost nothing substantive, return few or no items rather than padding.

Reply with JSON only, in exactly this shape:
{
  "whatTheyDo": string,          // 1-2 plain sentences: what this company actually does, from what the pages say
  "focusAreas": [                // 0-5 items: products, markets, or technical focus the pages actually describe
    { "title": string,           //   max 8 words
      "evidence": string }       //   max 40 words: the specific line or claim from the pages that supports it
  ],
  "cultureSignals": [            // 0-5 items: concrete, specific claims the pages make about how they work or what they value
    { "title": string,           //   max 8 words
      "evidence": string }       //   max 40 words: the specific line that supports it — not a repeated slogan
  ],
  "notes": [string]              // 0-3 short lines: anything worth flagging, e.g. "the pages given say almost nothing about engineering practices"
}`;

function truncate(input: string, limit: number): string {
  const trimmed = input.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

export function buildDigest(input: CompanyBriefInput): string {
  const lines: string[] = [];
  for (const page of input.pages.slice(0, MAX_PAGES)) {
    lines.push(`## Page: ${page.url}`);
    if (page.title) lines.push(`Title: ${page.title}`);
    if (page.description) lines.push(`Meta description: ${page.description}`);
    lines.push(truncate(page.text, MAX_TEXT_CHARS_PER_PAGE));
    lines.push("");
  }
  return lines.join("\n");
}

function str(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return truncate(value.replace(/\s+/g, " "), maxChars);
}

function highlights(value: unknown, max: number): AiHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AiHighlight => {
      const record = (item ?? {}) as Record<string, unknown>;
      return { title: str(record.title, 90), evidence: str(record.evidence, 320) };
    })
    // A claim with no supporting line is the exact unsupported assertion this exists to avoid.
    .filter((item) => item.title.length > 0 && item.evidence.length > 0)
    .slice(0, max);
}

function stringList(value: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = str(item, maxChars);
    if (text) out.push(text);
    if (out.length === max) break;
  }
  return out;
}

export function normalizeCompanyBrief(
  raw: Record<string, unknown>,
  sourceUrls: string[],
  model: string,
  generatedAt: string,
): CompanyBrief {
  return {
    model,
    generatedAt,
    sourceUrls,
    whatTheyDo: str(raw.whatTheyDo, 400),
    focusAreas: highlights(raw.focusAreas, 5),
    cultureSignals: highlights(raw.cultureSignals, 5),
    notes: stringList(raw.notes, 3, 240),
  };
}

export function isEmptyCompanyBrief(brief: CompanyBrief): boolean {
  return (
    brief.whatTheyDo.length === 0 &&
    brief.focusAreas.length === 0 &&
    brief.cultureSignals.length === 0
  );
}

export async function draftCompanyBrief(input: CompanyBriefInput): Promise<CompanyBrief> {
  const { json, model } = await chatJson({
    system: SYSTEM_PROMPT,
    user: buildDigest(input),
    maxTokens: 2000,
    temperature: 0.3,
  });

  return normalizeCompanyBrief(
    json,
    input.pages.slice(0, MAX_PAGES).map((page) => page.url),
    model,
    new Date().toISOString(),
  );
}
