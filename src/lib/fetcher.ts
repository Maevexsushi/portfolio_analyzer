import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Network layer for the analyzer.
 *
 * Everything here takes a URL that ultimately came from user input, so each hop is
 * re-validated: scheme allow-list, DNS resolution checked against private ranges,
 * redirects followed manually, response body capped. Without the manual redirect
 * loop a public host could 302 us into 169.254.x.x or localhost.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; PortfolioAnalyzer/0.1; +https://example.com/bot)";

/**
 * Escape hatch for testing against local fixtures. Double-gated — it needs the env var
 * AND a non-production build — because switching it on in production would turn the
 * analyzer into an SSRF proxy into the deployment's own network.
 */
const ALLOW_PRIVATE_HOSTS =
  process.env.NODE_ENV !== "production" &&
  process.env.ANALYZER_ALLOW_PRIVATE_HOSTS === "1";

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;

export class FetchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FetchError";
    this.code = code;
  }
}

export interface FetchedPage {
  html: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  bytes: number;
  ttfbMs: number;
  downloadMs: number;
  redirectChain: string[];
  truncated: boolean;
}

/** Normalize whatever the user typed into a URL we are willing to request. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new FetchError("empty", "Enter a portfolio URL.");

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new FetchError("invalid", `"${input}" is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("scheme", "Only http:// and https:// URLs can be analyzed.");
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new FetchError("invalid", `"${url.hostname}" is not a resolvable hostname.`);
  }

  url.hash = "";
  return url;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::" || addr === "::1") return true;
  if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/** Throws when a hostname resolves anywhere we should not be sending requests. */
async function assertPublicHost(url: URL): Promise<void> {
  if (ALLOW_PRIVATE_HOSTS) return;

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new FetchError("blocked", "Local and internal hostnames cannot be analyzed.");
  }

  const literal = isIP(host);
  if (literal === 4 || literal === 6) {
    const isPrivate = literal === 4 ? isPrivateIPv4(host) : isPrivateIPv6(host);
    if (isPrivate) {
      throw new FetchError("blocked", "Private network addresses cannot be analyzed.");
    }
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new FetchError("dns", `Could not resolve "${host}". Check the spelling.`);
  }

  if (addresses.length === 0) {
    throw new FetchError("dns", `Could not resolve "${host}".`);
  }

  for (const { address, family } of addresses) {
    const isPrivate = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (isPrivate) {
      throw new FetchError(
        "blocked",
        `"${host}" resolves to a private address and cannot be analyzed.`,
      );
    }
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Read a response body with a hard byte ceiling so one huge page can't exhaust memory. */
async function readCapped(
  response: Response,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) return { text: "", bytes: 0, truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (bytes - MAX_HTML_BYTES))));
      truncated = true;
      await reader.cancel().catch(() => {});
      bytes = MAX_HTML_BYTES;
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    bytes,
    truncated,
  };
}

/**
 * Fetch a portfolio page as HTML, following redirects one hop at a time so every
 * intermediate host is re-validated.
 */
export async function fetchPage(
  rawUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchedPage> {
  let url = normalizeUrl(rawUrl);
  const redirectChain: string[] = [];
  const startedAt = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);

    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      throw new FetchError("timeout", "The site took too long to respond.");
    }

    const requestedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|abort/i.test(message)) {
        throw new FetchError("timeout", "The site took too long to respond.");
      }
      throw new FetchError("network", `Could not reach ${url.hostname}: ${message}`);
    }

    const ttfbMs = Date.now() - requestedAt;

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchError("redirect", `${url.href} returned a redirect with no target.`);
      }
      await response.body?.cancel().catch(() => {});
      redirectChain.push(url.href);
      try {
        url = new URL(location, url);
      } catch {
        throw new FetchError("redirect", `Invalid redirect target: ${location}`);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new FetchError("scheme", "Redirected to a non-HTTP URL.");
      }
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => {});
      throw new FetchError(
        "forbidden",
        `${url.hostname} blocked the request (HTTP ${response.status}). Some hosts reject automated tools.`,
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new FetchError("http", `${url.href} returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      throw new FetchError(
        "content-type",
        `Expected an HTML page but got "${contentType.split(";")[0]}".`,
      );
    }

    const downloadStart = Date.now();
    const { text, bytes, truncated } = await readCapped(response);
    const downloadMs = Date.now() - downloadStart;

    if (!text.trim()) {
      throw new FetchError("empty-body", "The page returned an empty response body.");
    }

    return {
      html: text,
      finalUrl: response.url || url.href,
      status: response.status,
      headers: headersToObject(response.headers),
      bytes,
      ttfbMs,
      downloadMs,
      redirectChain,
      truncated,
    };
  }

  throw new FetchError("redirect", "Too many redirects.");
}

/** Download a subresource (stylesheet) as text, capped. Returns null on any failure. */
export async function fetchAssetText(
  rawUrl: string,
  maxBytes = 300 * 1024,
  timeoutMs = 8000,
): Promise<{ text: string; bytes: number } | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    await assertPublicHost(url);
  } catch {
    return null;
  }

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: "text/css,*/*;q=0.1" },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > maxBytes * 4) {
      await response.body?.cancel().catch(() => {});
      return { text: "", bytes: declared };
    }
    const reader = response.body?.getReader();
    if (!reader) return { text: "", bytes: 0 };

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      bytes += value.byteLength;
    }
    await reader.cancel().catch(() => {});

    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
      bytes: declared || bytes,
    };
  } catch {
    return null;
  }
}

/** Ask for a resource's transfer size without downloading it. */
export async function getResourceSize(
  rawUrl: string,
  timeoutMs = 6000,
): Promise<number | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    await assertPublicHost(url);
  } catch {
    return null;
  }

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
    });
    await response.body?.cancel().catch(() => {});
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? "");
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

export interface LinkProbe {
  status: number | null;
  ok: boolean;
  /** Host answered, but refused an automated request — unverifiable, not broken. */
  blocked: boolean;
  error: string | null;
  redirectedTo: string | null;
}

/**
 * Statuses that mean "not for bots" rather than "dead". Medium, Ko-fi, and Cloudflare
 * front doors answer 403 to anything without a browser fingerprint; LinkedIn uses 999.
 * Reporting these as broken would tell people to fix links that work fine for humans.
 */
const BOT_BLOCK_STATUSES = new Set([401, 403, 429, 999]);

/**
 * Probe one link for the link checker. HEAD first (cheap), falling back to a ranged
 * GET because plenty of servers answer HEAD with 405 while the page is perfectly fine.
 */
export async function probeLink(rawUrl: string, timeoutMs = 8000): Promise<LinkProbe> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { status: null, ok: false, blocked: false, error: "Malformed URL", redirectedTo: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { status: null, ok: true, blocked: false, error: null, redirectedTo: null };
  }

  try {
    await assertPublicHost(url);
  } catch (error) {
    return {
      status: null,
      ok: false,
      blocked: false,
      error: error instanceof FetchError ? error.message : "Blocked address",
      redirectedTo: null,
    };
  }

  const attempt = async (method: "HEAD" | "GET"): Promise<Response> =>
    fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
        ...(method === "GET" ? { range: "bytes=0-2048" } : {}),
      },
    });

  try {
    let response = await attempt("HEAD");
    if (response.status === 405 || response.status === 501 || response.status === 403) {
      await response.body?.cancel().catch(() => {});
      response = await attempt("GET");
    }
    await response.body?.cancel().catch(() => {});

    const redirectedTo =
      response.url && response.url !== url.href ? response.url : null;
    const blocked = BOT_BLOCK_STATUSES.has(response.status);

    return {
      status: response.status,
      ok: response.status < 400 || blocked,
      blocked,
      error: blocked
        ? `Host refused an automated request (HTTP ${response.status}) — verify it by hand`
        : null,
      redirectedTo,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: null,
      ok: false,
      blocked: false,
      error: /timeout|abort/i.test(message) ? "Timed out" : "Unreachable",
      redirectedTo: null,
    };
  }
}
