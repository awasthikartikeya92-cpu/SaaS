import { describe, it, expect, afterEach, vi } from "vitest";

// Same pattern as src/lib/research/index.test.ts: getFirmographicsProvider()
// only instantiates a provider class (the constructor does no network work)
// and caches at module scope, so env stubbing + vi.resetModules() is safe.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getFirmographicsProvider auto-detection", () => {
  it("returns null when nothing is configured -- optional enrichment, not required", async () => {
    const { getFirmographicsProvider } = await import("./index");
    expect(getFirmographicsProvider()).toBeNull();
  });

  it("infers tavily from TAVILY_API_KEY alone -- reuses the same key research already needs", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const { getFirmographicsProvider } = await import("./index");
    expect(getFirmographicsProvider()?.name).toBe("tavily-firmographics");
  });

  it("FIRMOGRAPHICS_PROVIDER=none opts back out even with a Tavily key present", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    vi.stubEnv("FIRMOGRAPHICS_PROVIDER", "none");
    const { getFirmographicsProvider } = await import("./index");
    expect(getFirmographicsProvider()).toBeNull();
  });

  it("caches the result across repeated calls within the same module instance", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const { getFirmographicsProvider } = await import("./index");
    expect(getFirmographicsProvider()).toBe(getFirmographicsProvider());
  });
});
