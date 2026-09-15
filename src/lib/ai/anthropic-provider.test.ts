import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Regression coverage for the bug this file's history describes: maxRetries: 0
// (needed to stop a connection timeout from silently doubling into two full
// timeout windows -- see anthropic-provider.ts's big comment) also removed
// retry protection for ordinary transient errors (429 rate limits, 5xx/529
// overloaded) that Anthropic's own SDK is specifically designed to retry
// through. That's what was actually causing campaigns to fail intermittently
// at whichever agent happened to be running when Anthropic returned one.
// These tests exercise the selective-retry replacement directly against a
// mocked `fetch` (same technique as prompt-caching.test.ts), not just read
// the code -- a real HTTP status/header round trip, not an assumption about
// what the SDK does with one.

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const RATE_LIMIT_BODY = { type: "error", error: { type: "rate_limit_error", message: "Rate limited" } };
const OVERLOADED_BODY = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
const BAD_REQUEST_BODY = { type: "error", error: { type: "invalid_request_error", message: "Bad request" } };
const SUCCESS_BODY = { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } };

let callCount: number;

/** Each call to fetch returns the next response in sequence; the mock never re-reads a Response body twice. */
function mockFetchSequence(...responses: Response[]) {
  callCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const res = responses[callCount];
      callCount++;
      return res;
    })
  );
}

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-fake-key-for-tests");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules(); // getAiProvider() caches its provider instance at module scope
});

describe("AnthropicProvider selective retry", () => {
  it("retries once on a 429 rate limit (honoring a zero retry-after) and succeeds", async () => {
    mockFetchSequence(jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "0" }), jsonResponse(200, SUCCESS_BODY));
    const { getAiProvider } = await import("./index");
    const result = await getAiProvider().complete({ system: "sys", messages: [{ role: "user", content: "hi" }] });

    expect(result).toBe("ok");
    expect(callCount).toBe(2);
  });

  it("retries once on a 5xx overloaded error with no retry-after header and succeeds", async () => {
    mockFetchSequence(jsonResponse(529, OVERLOADED_BODY), jsonResponse(200, SUCCESS_BODY));
    const { getAiProvider } = await import("./index");
    const result = await getAiProvider().complete({ system: "sys", messages: [{ role: "user", content: "hi" }] });

    expect(result).toBe("ok");
    expect(callCount).toBe(2);
  }, 10_000);

  it("does not retry a 400 bad request -- fails on the first attempt", async () => {
    mockFetchSequence(jsonResponse(400, BAD_REQUEST_BODY));
    const { getAiProvider } = await import("./index");

    await expect(getAiProvider().complete({ system: "sys", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow();
    expect(callCount).toBe(1);
  });

  it("gives up after a second consecutive 429 -- retries exactly once, not indefinitely", async () => {
    mockFetchSequence(jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "0" }), jsonResponse(429, RATE_LIMIT_BODY, { "retry-after": "0" }));
    const { getAiProvider } = await import("./index");

    await expect(getAiProvider().complete({ system: "sys", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow();
    expect(callCount).toBe(2);
  });
});
