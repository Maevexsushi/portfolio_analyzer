import type { Check, ContactReport } from "@/lib/types";
import type { ExtractedDocument } from "@/lib/intake";
import type { DisciplineProfile } from "@/lib/discipline/types";
import { scoreFromChecks } from "@/lib/analyzer/check-utils";

/**
 * Contact extraction for uploaded documents.
 *
 * A resume that a recruiter cannot act on is worth nothing, and the ways that happens
 * are mundane: the phone number lives inside a header image, the email is a hyperlink
 * with the display text "click here", the name is set in a display font the extractor
 * reads as gibberish. So this looks in the text a machine can actually see, and reports
 * what is missing from *there* rather than what a human eye can find on the page.
 */

const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

/**
 * Phone numbers, deliberately loose.
 *
 * Resumes carry every format on earth — +44 7700 900123, (555) 019-2837, 0917 123 4567 —
 * and a strict pattern tuned to one country silently tells everyone else their number
 * is missing. Requiring 9+ digits with optional separators catches the real ones; the
 * date-range guard below removes the thing that would otherwise match constantly.
 */
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

/** "2019 - 2022" and "01/2020 – 03/2021" both satisfy a loose phone pattern. */
const DATE_RANGE = /^[\s(]*(19|20)\d{2}\s*[-–—/]\s*((19|20)\d{2}|present|current)/i;

/**
 * Location lines. Matching "City, XX" or "City, Country" is the only reliable shape;
 * anything looser starts claiming that "Manager, Operations" is an address.
 */
const LOCATION =
  /\b([A-Z][a-z]+(?:[ -][A-Z][a-z]+)*),\s*([A-Z]{2,3}|[A-Z][a-z]+(?:[ -][A-Z][a-z]+)*)\b/;

const LOCATION_HINT =
  /\b(remote|hybrid|based in|located in|street|avenue|road|city|county|district)\b/i;

/** Words that mean a line is a job title or section heading, not a person's name. */
const NOT_A_NAME =
  /\b(resume|curriculum|vitae|\bcv\b|portfolio|profile|summary|objective|experience|education|skills|contact|references|engineer|manager|designer|developer|analyst|consultant|specialist|coordinator|assistant|director|officer|nurse|teacher)\b/i;

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 60) return false;
  if (NOT_A_NAME.test(line)) return false;
  if (EMAIL.test(line) || /\d/.test(line)) return false;

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  // Either Title Case or the ALL CAPS people set their name in at the top of a resume.
  const titleCase = words.every((word) => /^[A-Z][a-z'’-]*\.?$/.test(word));
  const allCaps = line === line.toUpperCase() && /^[A-Z][A-Z\s'’.-]+$/.test(line);
  return titleCase || allCaps;
}

/** Platform links, labelled by the profile so each field's proof-of-work is named. */
function labelledLinks(
  urls: string[],
  profile: DisciplineProfile,
): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const platform = profile.platforms.find((entry) => entry.pattern.test(url));
    out.push({ label: platform?.label ?? "Link", url });
  }
  return out;
}

export interface ContactOptions {
  /** Resumes must be contactable. A portfolio deck gets the same advice, less harshly. */
  strict: boolean;
}

export function analyzeContact(
  document: ExtractedDocument,
  profile: DisciplineProfile,
  options: ContactOptions,
): ContactReport {
  /*
   * Contact details cluster at the top, so only the top is searched.
   *
   * Scoped to the first page rather than to a line count: a designed resume can have a
   * four-line cover page, and "first fifteen lines" then reaches onto page two and
   * reports a referee's phone number as the candidate's own.
   */
  const firstPage = document.pages[0]?.lines ?? document.lines;
  const head = firstPage.slice(0, 20);

  // Prefer an address in the header. Fall back to anywhere, because a scrambled
  // multi-column extraction can drop the header block into the middle of the text.
  const email = EMAIL.exec(head.join("\n"))?.[0] ?? EMAIL.exec(document.text)?.[0] ?? null;

  let phone: string | null = null;
  for (const line of head) {
    if (DATE_RANGE.test(line)) continue;
    const match = PHONE.exec(line)?.[0]?.trim();
    // Nine digits is the shortest real number; below that it is a date or an ID.
    if (match && (match.replace(/\D/g, "").length >= 9)) {
      phone = match;
      break;
    }
  }

  const name = head.find(looksLikeName) ?? null;

  let location: string | null = null;
  for (const line of head) {
    if (line.length > 80) continue;
    const match = LOCATION.exec(line);
    if (match && !NOT_A_NAME.test(match[0])) {
      location = match[0];
      break;
    }
    if (LOCATION_HINT.test(line) && line.length < 60) {
      location = line;
      break;
    }
  }

  const links = labelledLinks(document.links, profile);
  const expectedPlatforms = profile.platforms.filter((platform) => platform.weight === "expected");
  const matchedExpected = expectedPlatforms.filter((platform) =>
    document.links.some((url) => platform.pattern.test(url)),
  );

  const checks: Check[] = [
    {
      id: "contact-email",
      label: "Email address",
      status: email ? "pass" : "fail",
      detail: email
        ? `Found: ${email}`
        : document.origin === "ocr"
          ? "No email address could be recognised. In an image, an address is unselectable even when a human can see it — nobody can copy it into a reply."
          : "No email address found in the readable text. This is the one thing a recruiter must be able to act on.",
    },
    {
      id: "contact-phone",
      label: "Phone number",
      status: phone ? "pass" : options.strict ? "warn" : "pass",
      detail: phone
        ? `Found: ${phone}`
        : "No phone number found. Not every field expects one, but recruiters who shortlist by phone will skip you.",
    },
    {
      id: "contact-name",
      label: "Name at the top",
      status: name ? "pass" : "warn",
      detail: name
        ? `Reads as: ${name}`
        : "No name could be read from the first few lines. If yours is set in a decorative font or sits inside an image, the text layer does not contain it — and neither will an employer's database.",
    },
    {
      id: "contact-location",
      label: "Location",
      status: location ? "pass" : "warn",
      detail: location
        ? `Found: ${location}`
        : "No location found. A city and country (or 'Remote') answers the first filter question a recruiter applies.",
    },
    {
      id: "contact-proof",
      label: expectedPlatforms.length > 0 ? expectedPlatforms[0].label : "Profile links",
      status:
        expectedPlatforms.length === 0
          ? links.length > 0
            ? "pass"
            : "warn"
          : matchedExpected.length === expectedPlatforms.length
            ? "pass"
            : matchedExpected.length > 0
              ? "warn"
              : "fail",
      detail:
        expectedPlatforms.length === 0
          ? links.length > 0
            ? `${links.length} profile link${links.length === 1 ? "" : "s"} found.`
            : "No profile links found."
          : matchedExpected.length === expectedPlatforms.length
            ? `Linked: ${matchedExpected.map((platform) => platform.label).join(", ")}.`
            : `Missing: ${expectedPlatforms
                .filter((platform) => !matchedExpected.includes(platform))
                .map((platform) => `${platform.label} — ${platform.note}`)
                .join(" ")}`,
    },
  ];

  if (document.links.length > 0 && !document.hasClickableLinks) {
    checks.push({
      id: "contact-clickable",
      label: "Links are clickable",
      status: "warn",
      detail: `${document.links.length} URL${document.links.length === 1 ? " is" : "s are"} printed as text but not linked. A reviewer reading on screen has to retype them, and most will not.`,
    });
  }

  return {
    score: scoreFromChecks(checks, {
      "contact-email": 3,
      "contact-proof": 2,
      "contact-phone": 1,
      "contact-name": 1.5,
      "contact-location": 1,
      "contact-clickable": 0.75,
    }),
    name,
    email,
    phone,
    location,
    links,
    checks,
  };
}
