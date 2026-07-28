import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The anonymous identity that scopes one visitor's history to themselves, with no
 * login — a random id in a long-lived cookie, set the first time someone analyzes
 * something. There is no account behind it: clearing cookies or switching browsers
 * loses access to your own past history the same way clearing any other site's
 * local state would, and a report's own /r/[id] link stays sharable by anyone
 * holding it regardless of whose cookie is set — only the history *list* and
 * delete-all are scoped to this.
 */
const COOKIE_NAME = "analysis_owner";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Reads the existing owner cookie, or mints and sets a new one. Only callable from
 * a route handler or Server Action — a plain Server Component is not allowed to set
 * cookies and this throws there. Use this wherever an analysis is about to be saved,
 * since that is the one moment a fresh visitor's identity must be established.
 */
export async function ownerTokenForWrite(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const token = randomUUID();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return token;
}

/**
 * Read-only lookup, safe from a Server Component: a visitor who has never analyzed
 * anything has no cookie yet, and that must not be an error — it means their
 * history is simply empty, not that something failed.
 */
export async function ownerTokenForRead(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}
