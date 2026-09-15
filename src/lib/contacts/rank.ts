import type { EnrichedContact } from "./provider";
import { computeRoleRelevance } from "@/lib/scoring";

// Pulled out as its own pure function -- same reasoning as
// src/lib/agents/stage-decision.ts: this is the one piece of the
// enrichment path with real judgment in it (which real candidate, if any,
// is worth surfacing as a verified contact), so it needs to be testable
// without a live Hunter API key or a database connection.

// Below this, a candidate is real (a genuine name+title Hunter found) but
// not confident enough to call "verified" -- Hunter's own guidance treats
// confidence under this range as too likely to be stale or mismatched to
// promote over a recommended-title guess for a specific person's name.
const MIN_CONFIDENCE = Number(process.env.HUNTER_MIN_CONFIDENCE || 50) / 100;

/**
 * Picks the single best real candidate for this account, or null if none
 * clears the bar. "Best" means: confident enough per the *source's own*
 * confidence score (never overridden or estimated here), then most relevant
 * to the offering's stated buyer personas, then Hunter's confidence again as
 * a tiebreaker. Never invents or adjusts a candidate's own data -- this
 * function only selects among candidates a provider already returned.
 */
export function pickBestContact(candidates: EnrichedContact[], personaTitles: string[]): EnrichedContact | null {
  const confident = candidates.filter((c) => c.confidence >= MIN_CONFIDENCE);
  if (confident.length === 0) return null;

  const ranked = [...confident].sort((a, b) => {
    const relevanceDiff = computeRoleRelevance(b.title, personaTitles) - computeRoleRelevance(a.title, personaTitles);
    if (relevanceDiff !== 0) return relevanceDiff;
    return b.confidence - a.confidence;
  });

  return ranked[0];
}
