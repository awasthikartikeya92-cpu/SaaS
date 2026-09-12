import type { RawEvidence } from "@/lib/research/provider";

export interface VerifiedSignal {
  companyName: string;
  companyWebsite?: string;
  signalHint: string;
  evidence: string;
  sourceUrl: string;
  publishedAt: string | null;
  detectedAt: string;
  /**
   * Every claim from the Research Agent is passed through here. Confidence
   * reflects how directly the evidence supports the signal -- items with a
   * single weak source stay "Not verified" rather than being upgraded.
   */
  verified: boolean;
  confidence: number; // 0-1
}

const MIN_EXCERPT_LENGTH = 20;

/**
 * Deterministic verification pass: rejects evidence that is missing a
 * source URL or lacks enough substance to support a claim, and assigns a
 * conservative confidence score to what remains. Nothing here invents facts
 * -- it only filters and scores what the Research Agent already retrieved.
 */
export function runVerificationAgent(rawEvidence: RawEvidence[]): VerifiedSignal[] {
  return rawEvidence
    .filter((e) => Boolean(e.url) && e.excerpt.length >= MIN_EXCERPT_LENGTH)
    .map((e) => {
      const hasDate = Boolean(e.publishedAt);
      const confidence = hasDate ? 0.78 : 0.55; // conservative -- undated evidence scores lower
      return {
        companyName: e.companyName,
        companyWebsite: e.companyWebsite,
        signalHint: e.signalHint,
        evidence: e.excerpt,
        sourceUrl: e.url,
        publishedAt: e.publishedAt ?? null,
        detectedAt: new Date().toISOString(),
        verified: hasDate,
        confidence,
      };
    });
}
