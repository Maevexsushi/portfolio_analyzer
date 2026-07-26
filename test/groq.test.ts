import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatJson, isAiConfigured } from "@/lib/ai/groq";

/*
 * The multi-key fallback is the one piece of this transport that is not "a network
 * round trip" in the sense the rest of the AI module's tests decline to cover — it is
 * a decision this codebase makes about which failures deserve a second key and which
 * do not, and that decision is worth pinning with the network mocked out.
 */

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("isAiConfigured", () => {
  it("is false with neither key set", () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY2;
    expect(isAiConfigured()).toBe(false);
  });

  it("is true with only the second key set", () => {
    delete process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY2 = "gsk_second";
    expect(isAiConfigured()).toBe(true);
  });
});

describe("chatJson key fallback", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "gsk_first";
    process.env.GROQ_API_KEY2 = "gsk_second";
  });

  it("falls through to the second key when the first is rejected as unauthorized", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid key" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] }),
      );

    const result = await chatJson({ system: "s", user: "u" });

    expect(result.json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer gsk_first");
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer gsk_second");
  });

  it("falls through to the second key when the first reports a rate limit", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      // retry-after: 0 keeps the in-key backoff from slowing the test down.
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] }),
      );

    const result = await chatJson({ system: "s", user: "u" });
    expect(result.json).toEqual({ ok: true });
    // Two calls on the first (exhausted) key's in-key retry, then one on the second.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  /*
   * The core guard: a failure that says nothing about which key was used must not
   * burn the second key's quota chasing an outcome that will not change.
   */
  it("does not try the second key on a network failure", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(chatJson({ system: "s", user: "u" })).rejects.toMatchObject({ code: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not try a second key that was never configured", async () => {
    delete process.env.GROQ_API_KEY2;
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "invalid key" }));

    await expect(chatJson({ system: "s", user: "u" })).rejects.toMatchObject({ code: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws unconfigured when no key is set at all", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY2;
    await expect(chatJson({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "unconfigured",
    });
  });
});
