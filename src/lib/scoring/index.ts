// Deterministic scoring engine. Nothing here is an AI-guessed number --
// every score is a weighted formula over explicit inputs, so it can be
// explained and audited. Weights are config, not inline literals, so making
// them user-configurable later (Phase 4) is a settings change, not a rewrite.

export const SCORING_WEIGHTS = {
  icpFit: 0.4,
  intent: 0.4,
  reachability: 0.2,
};

export interface IcpFitInputs {
  industryMatch: number; // 0-100
  geographyMatch: number; // 0-100
  sizeMatch: number; // 0-100
  businessModelMatch: number; // 0-100
  techEnvironmentMatch: number; // 0-100
  problemRelevance: number; // 0-100
}

export interface SignalForIntent {
  tier: 1 | 2 | 3;
  confidence: number; // 0-1
  detectedAt: Date;
}

export interface ReachabilityInputs {
  decisionMakerIdentified: boolean;
  roleRelevance: number; // 0-100
  contactConfidence: number; // 0-1
}

const ICP_SUB_WEIGHTS = {
  industryMatch: 0.25,
  geographyMatch: 0.15,
  sizeMatch: 0.15,
  businessModelMatch: 0.15,
  techEnvironmentMatch: 0.15,
  problemRelevance: 0.15,
};

export function computeIcpFit(inputs: IcpFitInputs): number {
  const score =
    inputs.industryMatch * ICP_SUB_WEIGHTS.industryMatch +
    inputs.geographyMatch * ICP_SUB_WEIGHTS.geographyMatch +
    inputs.sizeMatch * ICP_SUB_WEIGHTS.sizeMatch +
    inputs.businessModelMatch * ICP_SUB_WEIGHTS.businessModelMatch +
    inputs.techEnvironmentMatch * ICP_SUB_WEIGHTS.techEnvironmentMatch +
    inputs.problemRelevance * ICP_SUB_WEIGHTS.problemRelevance;
  return clamp(score);
}

const TIER_DIRECTNESS: Record<1 | 2 | 3, number> = { 1: 100, 2: 65, 3: 35 };
const RECENCY_HALF_LIFE_DAYS = 30;

function recencyDecay(detectedAt: Date): number {
  const daysAgo = (Date.now() - detectedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysAgo / RECENCY_HALF_LIFE_DAYS) * 100;
}

export function computeIntent(signals: SignalForIntent[]): number {
  if (signals.length === 0) return 0;

  // This used to also weight a `strength` field at 0.25 alongside
  // `confidence` at 0.15 -- but every caller set strength = confidence*100
  // (there's no independent "how strong is this signal" measurement
  // anywhere in the research/verification pipeline today, only
  // "how much do we trust this evidence"), so the same number was silently
  // counted twice under two different names and two different weights,
  // giving confidence a real combined weight of 0.40 while the formula
  // read as if it were 0.15. Consolidated into one confidence term. If a
  // future research provider supplies a genuinely independent strength
  // signal (e.g. corroboration count, mention frequency), reintroduce it
  // as its own weighted input rather than reusing confidence under a
  // second name.
  const perSignal = signals.map((s) => {
    const directness = TIER_DIRECTNESS[s.tier];
    const recency = recencyDecay(s.detectedAt);
    return directness * 0.35 + recency * 0.3 + s.confidence * 100 * 0.35;
  });

  const avg = perSignal.reduce((a, b) => a + b, 0) / perSignal.length;
  // Corroboration bonus: more independent signals nudges intent up, capped.
  const corroborationBonus = Math.min((signals.length - 1) * 4, 20);
  return clamp(avg + corroborationBonus);
}

export function computeReachability(inputs: ReachabilityInputs): number {
  // Even without a verified decision maker (Phase 1 never claims one --
  // see contact-agent.ts), a confident, well-matched *recommended* title is
  // still real information from the Contact Agent, not nothing -- it used
  // to be discarded outright here (the early return below ignored
  // contactConfidence entirely, so every unverified account landed on the
  // exact same reachability regardless of what the Contact Agent actually
  // found). Blended in at a reduced weight so "verified" still matters far
  // more than "recommended" (0.4 combined weight here vs. 1.0 once
  // verified), rather than counting for literally zero.
  if (!inputs.decisionMakerIdentified) {
    return clamp(inputs.roleRelevance * 0.3 + inputs.contactConfidence * 100 * 0.1);
  }
  return clamp(inputs.roleRelevance * 0.5 + inputs.contactConfidence * 100 * 0.5);
}

/**
 * How well a Contact Agent recommendation matches one of the offering's
 * stated buyer personas -- real, computable data (persona titles come from
 * the Offering Agent's own output) standing in for the roleRelevance input
 * above, which used to be a flat 80 for every single account regardless of
 * how well the recommended title actually fit. Deliberately coarse (two
 * tiers, not a fabricated continuous score): a substring match either side
 * is a genuine, explainable signal ("this title matches a persona we
 * already derived from the offering"); anything finer than that would be
 * inventing precision this data doesn't support.
 */
export function computeRoleRelevance(recommendedTitle: string, personaTitles: string[]): number {
  if (personaTitles.length === 0) return 55; // nothing to compare against -- neutral, not a fabricated match
  const normalizedTitle = recommendedTitle.toLowerCase().trim();
  const matchesAPersona = personaTitles.some((p) => {
    const normalizedPersona = p.toLowerCase().trim();
    return normalizedPersona.length > 0 && (normalizedTitle.includes(normalizedPersona) || normalizedPersona.includes(normalizedTitle));
  });
  return matchesAPersona ? 85 : 55;
}

export function computeOpportunityScore(icpFit: number, intent: number, reachability: number): number {
  return clamp(
    icpFit * SCORING_WEIGHTS.icpFit + intent * SCORING_WEIGHTS.intent + reachability * SCORING_WEIGHTS.reachability
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
