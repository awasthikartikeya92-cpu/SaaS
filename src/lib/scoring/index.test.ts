import { describe, it, expect } from "vitest";
import {
  computeIcpFit,
  computeIntent,
  computeReachability,
  computeRoleRelevance,
  computeOpportunityScore,
} from "./index";

describe("computeIcpFit", () => {
  it("weights all six sub-scores and clamps to 0-100", () => {
    const perfect = computeIcpFit({
      industryMatch: 100,
      geographyMatch: 100,
      sizeMatch: 100,
      businessModelMatch: 100,
      techEnvironmentMatch: 100,
      problemRelevance: 100,
    });
    expect(perfect).toBe(100);

    const zero = computeIcpFit({
      industryMatch: 0,
      geographyMatch: 0,
      sizeMatch: 0,
      businessModelMatch: 0,
      techEnvironmentMatch: 0,
      problemRelevance: 0,
    });
    expect(zero).toBe(0);
  });

  it("actually varies with industryMatch -- regression guard for the tautological check that used to make this always 71.3", () => {
    // The real bug wasn't in this function -- computeIcpFit has always
    // correctly weighted its inputs. It was the *caller* in orchestrator.ts
    // passing `industry && icp.industries.includes(industry) ? 90 : 45`
    // where `industry` was assigned from icp.industries[0] moments
    // earlier, making the check always true. This test can't catch a bad
    // caller, but it documents the contract the caller must honor: this
    // function must produce different output for different input, or a
    // caller feeding it a constant would be invisible.
    const withGoodIndustryMatch = computeIcpFit({
      industryMatch: 90,
      geographyMatch: 65,
      sizeMatch: 65,
      businessModelMatch: 65,
      techEnvironmentMatch: 60,
      problemRelevance: 70,
    });
    const withPoorIndustryMatch = computeIcpFit({
      industryMatch: 45,
      geographyMatch: 65,
      sizeMatch: 65,
      businessModelMatch: 65,
      techEnvironmentMatch: 60,
      problemRelevance: 70,
    });
    expect(withGoodIndustryMatch).toBeGreaterThan(withPoorIndustryMatch);
  });
});

describe("computeIntent", () => {
  it("returns 0 for no signals", () => {
    expect(computeIntent([])).toBe(0);
  });

  it("weights tier directness, recency, and confidence -- no separate 'strength' input", () => {
    // Regression guard: SignalForIntent used to also take a `strength`
    // field weighted at 0.25 alongside `confidence` at 0.15, but every
    // real caller set strength = confidence*100 -- the exact same number
    // under two names, silently giving confidence a real combined weight
    // of 0.40 instead of the 0.15 the formula read as. If `strength` were
    // ever reintroduced to the interface without a genuinely independent
    // source, this call would need updating -- that's the point: the type
    // signature itself should be the thing that catches it.
    const highConfidence = computeIntent([{ tier: 1, confidence: 0.95, detectedAt: new Date() }]);
    const lowConfidence = computeIntent([{ tier: 1, confidence: 0.3, detectedAt: new Date() }]);
    expect(highConfidence).toBeGreaterThan(lowConfidence);
  });

  it("Tier 1 signals score higher than Tier 3 at equal confidence and recency", () => {
    const now = new Date();
    const tier1 = computeIntent([{ tier: 1, confidence: 0.78, detectedAt: now }]);
    const tier3 = computeIntent([{ tier: 3, confidence: 0.78, detectedAt: now }]);
    expect(tier1).toBeGreaterThan(tier3);
  });

  it("applies a corroboration bonus for multiple independent signals, capped", () => {
    const now = new Date();
    const one = computeIntent([{ tier: 2, confidence: 0.78, detectedAt: now }]);
    const five = computeIntent(Array.from({ length: 5 }, () => ({ tier: 2 as const, confidence: 0.78, detectedAt: now })));
    expect(five).toBeGreaterThan(one);
    // Same per-signal inputs, so the entire gap between `one` and `five` is
    // the corroboration bonus -- capped at 20 (see computeIntent's
    // implementation), so five identical signals can add at most 16
    // (4 extra signals * 4) before clamp(), and never enough to push a
    // low-confidence base score past a high one on signal count alone.
    expect(five - one).toBeLessThanOrEqual(20);
  });

  it("decays intent for older evidence", () => {
    const fresh = computeIntent([{ tier: 2, confidence: 0.78, detectedAt: new Date() }]);
    const stale = computeIntent([
      { tier: 2, confidence: 0.78, detectedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    ]);
    expect(fresh).toBeGreaterThan(stale);
  });
});

describe("computeReachability", () => {
  it("no longer discards contactConfidence when there's no verified decision maker", () => {
    // This was the actual bug: the `!decisionMakerIdentified` branch used
    // to return `roleRelevance * 0.3` and never touch contactConfidence at
    // all, so this value was silently 24 on every single account (since
    // decisionMakerIdentified is always false in Phase 1 -- no
    // people-enrichment source exists -- and roleRelevance was hardcoded to
    // 80 for every account too). A Contact Agent call that ran, and cost
    // money, on every account, affected nothing a user ever saw.
    const lowConfidence = computeReachability({ decisionMakerIdentified: false, roleRelevance: 70, contactConfidence: 0.1 });
    const highConfidence = computeReachability({ decisionMakerIdentified: false, roleRelevance: 70, contactConfidence: 0.95 });
    expect(highConfidence).toBeGreaterThan(lowConfidence);
  });

  it("still weights a verified decision maker far more heavily than a recommended one", () => {
    const unverified = computeReachability({ decisionMakerIdentified: false, roleRelevance: 85, contactConfidence: 0.95 });
    const verified = computeReachability({ decisionMakerIdentified: true, roleRelevance: 85, contactConfidence: 0.95 });
    expect(verified).toBeGreaterThan(unverified);
  });
});

describe("computeRoleRelevance", () => {
  it("scores a title matching a stated persona higher than one that doesn't", () => {
    // Regression guard: this replaced a flat 80 for every single account,
    // regardless of how well (or badly) the Contact Agent's recommendation
    // actually matched anything the Offering Agent derived.
    const matched = computeRoleRelevance("VP of Engineering", ["VP of Engineering", "Head of IT"]);
    const unmatched = computeRoleRelevance("Chief Bagel Officer", ["VP of Engineering", "Head of IT"]);
    expect(matched).toBeGreaterThan(unmatched);
  });

  it("matches case-insensitively and either direction of substring", () => {
    expect(computeRoleRelevance("vp of engineering, north america", ["VP of Engineering"])).toBeGreaterThan(
      computeRoleRelevance("chief bagel officer", ["VP of Engineering"])
    );
  });

  it("returns a neutral score, not a fabricated match, when there are no personas to compare against", () => {
    const withNoPersonas = computeRoleRelevance("VP of Engineering", []);
    const noMatch = computeRoleRelevance("Chief Bagel Officer", ["VP of Engineering"]);
    // "Nothing to compare against" must not silently read as "we found a
    // match" -- it should land at the same neutral floor as an actual
    // mismatch, not above it.
    expect(withNoPersonas).toBe(noMatch);
  });
});

describe("computeOpportunityScore", () => {
  it("weights icpFit and intent equally at 0.4 each, reachability at 0.2", () => {
    const base = computeOpportunityScore(50, 50, 50);
    expect(base).toBe(50); // uniform inputs -> output equals the input regardless of weights

    const icpFitOnly = computeOpportunityScore(100, 0, 0);
    const intentOnly = computeOpportunityScore(0, 100, 0);
    const reachabilityOnly = computeOpportunityScore(0, 0, 100);
    expect(icpFitOnly).toBeCloseTo(intentOnly, 5);
    expect(reachabilityOnly).toBeLessThan(icpFitOnly);
  });

  it("clamps to the 0-100 range", () => {
    expect(computeOpportunityScore(100, 100, 100)).toBe(100);
    expect(computeOpportunityScore(0, 0, 0)).toBe(0);
  });
});
