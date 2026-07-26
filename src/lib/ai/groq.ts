/**
 * Groq transport.
 *
 * One function: send a system+user pair, get parsed JSON back. Groq speaks the
 * OpenAI chat-completions dialect, so there is no SDK here — a `fetch` against one
 * endpoint is the whole client, and it keeps the dependency list honest.
 *
 * Everything in this module throws `AiError` with a code the caller can turn into a
 * warning. The AI review is an extra on top of a report that already stands on its
 * own, so no failure here may ever take an analysis down with it.
 *
 * Up to two keys are read (`GROQ_API_KEY`, `GROQ_API_KEY2`) and tried in order. Falling
 * through to the second key only happens for a failure that is plausibly *about the
 * key itself* — an exhausted quota or a rejected credential — never for a timeout or a
 * network error, which would fail identically on every key and would only cost the
 * request its whole deadline twice for no chance of a different outcome.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 20_000;

export type AiErrorCode =
  | "unconfigured"
  | "auth"
  | "rate-limit"
  | "timeout"
  | "network"
  | "http"
  | "empty"
  | "malformed";

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

export function aiModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

/** Every configured key, in try-order. Both env vars are optional; either alone is enough. */
function apiKeys(): string[] {
  return [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY2]
    .map((key) => key?.trim() ?? "")
    .filter((key) => key.length > 0);
}

/** True when at least one key is present. Callers skip the whole feature when this is false. */
export function isAiConfigured(): boolean {
  return apiKeys().length > 0;
}

function timeoutMs(): number {
  const raw = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

interface Completion {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * Reasoning models wrap their answer in prose or a fenced block often enough that
 * parsing the raw string alone is unreliable. Take the outermost brace pair when a
 * direct parse fails; anything else is a genuine malformation.
 */
function parseJsonObject(raw: string): Record<string, unknown> {
  const attempt = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(raw.trim());
  if (direct) return direct;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const braced = attempt(raw.slice(start, end + 1));
    if (braced) return braced;
  }

  throw new AiError("malformed", "The model did not return a JSON object.");
}

async function post(body: unknown, signal: AbortSignal, apiKey: string): Promise<Response> {
  try {
    return await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|abort/i.test(message)) {
      throw new AiError("timeout", "The model took too long to respond.");
    }
    throw new AiError("network", `Could not reach the Groq API: ${message}`);
  }
}

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  json: Record<string, unknown>;
  model: string;
}

/**
 * One JSON-mode completion against one key, with a single retry when the API asks us
 * to wait.
 *
 * `max_completion_tokens` has to cover reasoning tokens as well as the answer on
 * gpt-oss-class models — budgeting only for the visible output truncates the JSON
 * mid-string, which surfaces as a parse failure rather than an obvious one.
 */
async function requestOnce(
  body: unknown,
  deadline: AbortSignal,
  apiKey: string,
  model: string,
): Promise<ChatResult> {
  let response = await post(body, deadline, apiKey);

  if (response.status === 429 || response.status >= 500) {
    // Groq reports the exact wait; honour it once, then give up rather than queue
    // a user-facing request behind an unbounded backoff.
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 4000);
    await response.body?.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await post(body, deadline, apiKey);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    if (response.status === 401 || response.status === 403) {
      throw new AiError("auth", "The Groq API rejected the key.");
    }
    if (response.status === 429) {
      throw new AiError("rate-limit", "The Groq API rate limit was hit.");
    }
    throw new AiError("http", `Groq API returned HTTP ${response.status}. ${detail}`);
  }

  const payload = (await response.json().catch(() => null)) as Completion | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AiError("empty", "The model returned an empty response.");
  }

  return { json: parseJsonObject(content), model };
}

/**
 * Tries every configured key in order, falling through to the next one only when a
 * key failed for a reason that is plausibly about *that key* — exhausted quota,
 * rejected credential — never for a timeout or network error, which would fail the
 * same way on every key and would only spend the deadline twice for nothing.
 */
export async function chatJson(request: ChatRequest): Promise<ChatResult> {
  const keys = apiKeys();
  if (keys.length === 0) {
    throw new AiError("unconfigured", "No Groq API key is set (GROQ_API_KEY / GROQ_API_KEY2).");
  }

  const model = aiModel();
  const body = {
    model,
    temperature: request.temperature ?? 0.3,
    max_completion_tokens: request.maxTokens ?? 3000,
    // Low effort keeps latency near a second; this is a summarising task, not a puzzle.
    reasoning_effort: "low",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
  };

  const deadline = AbortSignal.timeout(timeoutMs());

  for (let index = 0; index < keys.length; index++) {
    try {
      return await requestOnce(body, deadline, keys[index], model);
    } catch (error) {
      const isLastKey = index === keys.length - 1;
      const keySpecific =
        error instanceof AiError && (error.code === "rate-limit" || error.code === "auth");
      if (isLastKey || !keySpecific) throw error;
      // Otherwise this key is exhausted or rejected and another one is configured —
      // fall through to try it.
    }
  }

  /* istanbul ignore next -- unreachable: the loop above always returns or throws. */
  throw new AiError("network", "All configured Groq API keys failed.");
}
