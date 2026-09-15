import { describe, it, expect, afterEach, vi } from "vitest";

// getResearchProvider() only instantiates provider classes (constructors do
// no network work -- see tavily-provider.ts/sec-edgar-provider.ts, both only
// assign a field) and caches at module scope, so this is safe to test
// directly via env stubbing + vi.resetModules(), the same pattern used in
// prompt-caching.test.ts for getAiProvider().

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getResearchProvider auto-detection", () => {
  it("falls back to mock when nothing is configured", async () => {
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("mock");
  });

  it("infers tavily from TAVILY_API_KEY alone -- no RESEARCH_PROVIDER needed", async () => {
    // This is the exact friction the fix removes: previously, setting only
    // the key did nothing at all, silently staying on mock data.
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("tavily");
  });

  it("an explicit RESEARCH_PROVIDER still wins over the inferred default", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    vi.stubEnv("RESEARCH_PROVIDER", "mock");
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("mock");
  });

  it("infers SEC EDGAR enabled from SEC_EDGAR_USER_AGENT alone", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "SignalIQ test@example.com");
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("mock+sec-edgar");
  });

  it("an explicit SEC_EDGAR_ENABLED=false still disables it even with a User-Agent set", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "SignalIQ test@example.com");
    vi.stubEnv("SEC_EDGAR_ENABLED", "false");
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("mock");
  });

  it("composes tavily + SEC EDGAR when both are inferred", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "SignalIQ test@example.com");
    const { getResearchProvider } = await import("./index");
    expect(getResearchProvider().name).toBe("tavily+sec-edgar");
  });
});
