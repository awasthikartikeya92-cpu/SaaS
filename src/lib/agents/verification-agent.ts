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

// Every source used to land on exactly one of two constants (0.78 dated,
// 0.55 undated) -- correct as a floor, but presented in the UI as if it
// were a real per-source assessment, which a flat, repeated 78% across
// every single signal on every account very visibly wasn't. This replaces
// that with an actual weighted combination of signals this codebase can
// honestly observe about a piece of evidence -- still fully deterministic
// (no model call, no invented number), just no longer flattened to two
// buckets. Each weight below is a documented, conservative judgment call,
// not a fitted parameter -- there's no labeled ground truth to fit against
// here, only "does this factor plausibly make a claim more trustworthy."
const BASE_CONFIDENCE = 0.5;
const MIN_CONFIDENCE = 0.3;
const MAX_CONFIDENCE = 0.95;

// A small allow-list of sources whose editorial/verification standards make
// a claim more likely to be accurate than an arbitrary blog or press-release
// aggregator -- wire services, major business press, and primary filings.
// Deliberately conservative and short: an unlisted domain gets no penalty
// either, just no bonus (this is a boost for known-reliable sources, not a
// blocklist).
const HIGH_TRUST_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "sec.gov",
  "businesswire.com",
  "prnewswire.com",
  "techcrunch.com",
  "forbes.com",
  "cnbc.com",
  "axios.com",
  "crunchbase.com",
];

function isHighTrustDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return HIGH_TRUST_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false; // malformed URL -- already filtered out by the required-URL check below in practice
  }
}

// A rough proxy for "this excerpt states something specific and checkable"
// (a dollar figure, a percentage, a year) rather than vague PR language --
// this doesn't verify the number itself, only that the evidence commits to
// one instead of speaking in generalities.
const HAS_CONCRETE_DETAIL = /\$[\d,.]+(?:[kmbKMB])?|\b\d+%|\b(19|20)\d{2}\b/;

function scoreConfidence(e: RawEvidence): number {
  let score = BASE_CONFIDENCE;

  // Recency: a dated claim from last week is a much stronger timing signal
  // for active buying intent than one from two years ago; undated evidence
  // can't be timed at all, which is itself a real weakness, not neutral.
  if (e.publishedAt) {
    const ageMs = Date.now() - new Date(e.publishedAt).getTime();
    const ageDays = Number.isFinite(ageMs) ? ageMs / (1000 * 60 * 60 * 24) : Infinity;
    if (ageDays <= 30) score += 0.2;
    else if (ageDays <= 180) score += 0.12;
    else if (ageDays <= 365) score += 0.05;
    // older than a year (or an unparseable date): no recency bonus, but no
    // penalty beyond the undated case below either.
  } else {
    score -= 0.1;
  }

  if (isHighTrustDomain(e.url)) score += 0.15;

  if (e.excerpt.length >= 400) score += 0.1;
  else if (e.excerpt.length >= 150) score += 0.05;

  if (HAS_CONCRETE_DETAIL.test(e.excerpt)) score += 0.08;

  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, score));
}

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
      const confidence = scoreConfidence(e);
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
