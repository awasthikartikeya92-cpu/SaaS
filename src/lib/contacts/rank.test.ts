import { describe, it, expect, afterEach, vi } from "vitest";
import type { EnrichedContact } from "./provider";

function contact(overrides: Partial<EnrichedContact>): EnrichedContact {
  return { name: "Jane Doe", title: "VP of Operations", email: null, linkedinUrl: null, confidence: 0.8, ...overrides };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("pickBestContact", () => {
  it("returns null when there are no candidates", async () => {
    const { pickBestContact } = await import("./rank");
    expect(pickBestContact([], ["VP of Operations"])).toBeNull();
  });

  it("returns null when every candidate is below the confidence floor", async () => {
    const { pickBestContact } = await import("./rank");
    const candidates = [contact({ confidence: 0.2 }), contact({ confidence: 0.4 })];
    expect(pickBestContact(candidates, ["VP of Operations"])).toBeNull();
  });

  it("picks the more persona-relevant candidate over a higher-confidence but irrelevant one", async () => {
    // This is the whole point of ranking by relevance first: a mismatched
    // title shouldn't win just because Hunter happened to be more sure
    // about it -- see computeRoleRelevance in src/lib/scoring/index.ts.
    const { pickBestContact } = await import("./rank");
    const irrelevantButConfident = contact({ name: "Alex Lee", title: "Front Desk Coordinator", confidence: 0.95 });
    const relevantMatch = contact({ name: "Sam Rivera", title: "VP of Operations", confidence: 0.6 });
    const best = pickBestContact([irrelevantButConfident, relevantMatch], ["VP of Operations"]);
    expect(best?.name).toBe("Sam Rivera");
  });

  it("breaks a relevance tie by confidence", async () => {
    const { pickBestContact } = await import("./rank");
    const lower = contact({ name: "Lower Confidence", title: "Director of Logistics", confidence: 0.55 });
    const higher = contact({ name: "Higher Confidence", title: "Director of Logistics", confidence: 0.85 });
    const best = pickBestContact([lower, higher], ["Director of Logistics"]);
    expect(best?.name).toBe("Higher Confidence");
  });

  it("never invents or adjusts a candidate's own data -- returns the exact object selected", async () => {
    const { pickBestContact } = await import("./rank");
    const only = contact({ name: "Exact Match", title: "VP of Operations", email: "exact@acme.com", confidence: 0.9 });
    expect(pickBestContact([only], ["VP of Operations"])).toEqual(only);
  });

  it("respects a custom HUNTER_MIN_CONFIDENCE threshold", async () => {
    vi.stubEnv("HUNTER_MIN_CONFIDENCE", "90");
    const { pickBestContact } = await import("./rank");
    // 85% confidence clears the default 50% floor but not a stricter 90% one.
    const candidates = [contact({ confidence: 0.85 })];
    expect(pickBestContact(candidates, ["VP of Operations"])).toBeNull();
  });
});
