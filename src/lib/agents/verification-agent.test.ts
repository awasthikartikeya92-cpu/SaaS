import { describe, it, expect } from "vitest";
import { runVerificationAgent } from "./verification-agent";
import type { RawEvidence } from "../research/provider";

function mkEvidence(overrides: Partial<RawEvidence> = {}): RawEvidence {
  return {
    companyName: "Acme Corp",
    companyWebsite: "acme.com",
    url: "https://acme.com/news/1",
    publishedAt: "2026-01-01",
    excerpt: "Acme Corp posted three open roles referencing the evaluated capability area.",
    signalHint: "hiring surge",
    ...overrides,
  };
}

describe("runVerificationAgent", () => {
  it("rejects evidence with no source URL", () => {
    const result = runVerificationAgent([mkEvidence({ url: "" })]);
    expect(result).toHaveLength(0);
  });

  it("rejects evidence with too short an excerpt to support a claim", () => {
    const result = runVerificationAgent([mkEvidence({ excerpt: "too short" })]);
    expect(result).toHaveLength(0);
  });

  it("keeps evidence that clears both bars", () => {
    const result = runVerificationAgent([mkEvidence()]);
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe("Acme Corp");
  });

  it("marks dated evidence verified with higher confidence than undated evidence", () => {
    const [dated] = runVerificationAgent([mkEvidence({ publishedAt: "2026-01-01" })]);
    const [undated] = runVerificationAgent([mkEvidence({ publishedAt: undefined })]);
    expect(dated.verified).toBe(true);
    expect(undated.verified).toBe(false);
    expect(dated.confidence).toBeGreaterThan(undated.confidence);
  });

  it("stays within a conservative, documented range regardless of inputs", () => {
    // Nothing here is model-guessed -- every input below is a plain
    // deterministic formula -- but it's a continuous weighted score now,
    // not a two-value lookup, so this checks the bounds rather than an
    // exact constant.
    const results = runVerificationAgent([
      mkEvidence({ publishedAt: "2026-01-01", url: "https://reuters.com/a", excerpt: "x".repeat(500) + " $10M 2026" }),
      mkEvidence({ publishedAt: undefined, url: "https://unknown-blog.example/a", excerpt: "a".repeat(21) }),
    ]);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.3);
      expect(r.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it("scores a recent, high-trust, detailed source higher than a thin one -- not the same flat number for every source", () => {
    // This is the exact bug being fixed: every source used to land on
    // identical confidence (0.78) regardless of how different the
    // underlying evidence actually was.
    const strong = mkEvidence({
      publishedAt: new Date().toISOString(),
      url: "https://reuters.com/business/acme-raises-50m",
      excerpt: "Acme Corp announced a $50M Series C round in 2026, tripling headcount. " + "Additional detail. ".repeat(20),
    });
    const weak = mkEvidence({
      publishedAt: undefined,
      url: "https://random-aggregator.example/post/1",
      excerpt: "Acme Corp mentioned in passing on a blog somewhere.",
    });
    const [strongResult] = runVerificationAgent([strong]);
    const [weakResult] = runVerificationAgent([weak]);
    expect(strongResult.confidence).toBeGreaterThan(weakResult.confidence);
    expect(strongResult.confidence).not.toBe(weakResult.confidence);
  });

  it("gives a recency bonus that decays with age", () => {
    const recent = mkEvidence({ publishedAt: new Date().toISOString() });
    const old = mkEvidence({ publishedAt: "2015-01-01" });
    const [recentResult] = runVerificationAgent([recent]);
    const [oldResult] = runVerificationAgent([old]);
    expect(recentResult.confidence).toBeGreaterThan(oldResult.confidence);
  });

  it("processes a mixed batch, keeping only what clears verification", () => {
    const result = runVerificationAgent([
      mkEvidence({ companyName: "Keep Co" }),
      mkEvidence({ companyName: "Drop Co (no url)", url: "" }),
      mkEvidence({ companyName: "Drop Co (short excerpt)", excerpt: "nope" }),
    ]);
    expect(result.map((r) => r.companyName)).toEqual(["Keep Co"]);
  });
});
