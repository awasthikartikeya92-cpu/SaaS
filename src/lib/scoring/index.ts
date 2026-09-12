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
  strength: number; // 0-100
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

  const perSignal = signals.map((s) => {
    const directness = TIER_DIRECTNESS[s.tier];
    const recency = recencyDecay(s.detectedAt);
    return (directness * 0.35 + recency * 0.25 + s.strength * 0.25 + s.confidence * 100 * 0.15);
  });

  const avg = perSignal.reduce((a, b) => a + b, 0) / perSignal.length;
  // Corroboration bonus: more independent signals nudges intent up, capped.
  const corroborationBonus = Math.min((signals.length - 1) * 4, 20);
  return clamp(avg + corroborationBonus);
}

export function computeReachability(inputs: ReachabilityInputs): number {
  if (!inputs.decisionMakerIdentified) return clamp(inputs.roleRelevance * 0.3);
  return clamp(inputs.roleRelevance * 0.5 + inputs.contactConfidence * 100 * 0.5);
}

export function computeOpportunityScore(icpFit: number, intent: number, reachability: number): number {
  return clamp(
    icpFit * SCORING_WEIGHTS.icpFit + intent * SCORING_WEIGHTS.intent + reachability * SCORING_WEIGHTS.reachability
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
