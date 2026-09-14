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

  it("never invents a confidence outside a conservative, deterministic range", () => {
    // Nothing here is model-guessed -- it's a fixed lookup, not a
    // continuous score, so both values should be exactly one of the two
    // documented constants, not something in between.
    const [dated] = runVerificationAgent([mkEvidence({ publishedAt: "2026-01-01" })]);
    const [undated] = runVerificationAgent([mkEvidence({ publishedAt: undefined })]);
    expect(dated.confidence).toBe(0.78);
    expect(undated.confidence).toBe(0.55);
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
