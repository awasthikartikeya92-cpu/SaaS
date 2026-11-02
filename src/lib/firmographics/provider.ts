// Firmographics provider abstraction. This exists to answer the question
// research/seeding could never actually answer: does this discovered
// company genuinely belong to the campaign's target industries, and what
// is publicly known about its size/revenue? Modeled on the same
// interface/auto-detect/graceful-degradation shape as
// src/lib/research/provider.ts and src/lib/contacts/provider.ts -- an
// unconfigured or failed lookup returns null, never a guess.

export interface FirmographicsResult {
  /** The company's actual industry/business category, as described by the
   *  source -- never assumed from the campaign's own target list or from
   *  the company name alone. */
  industry: string;
  /** Whether that real industry plausibly falls under the campaign's
   *  target industries -- a classification against the evidence text, not
   *  a lookup this codebase can independently prove. */
  industryMatchesTarget: boolean;
  /** e.g. "51-200 employees" -- a range as stated or reasonably summarized
   *  from the source, never a fabricated exact figure. Null if the source
   *  doesn't say. */
  employeeRange: string | null;
  /** e.g. "$10M-$50M" -- same honesty rule as employeeRange. */
  revenueRange: string | null;
  sourceUrl: string;
  sourceExcerpt: string;
}

export interface FirmographicsQuery {
  companyName: string;
  website: string | null;
  /** The campaign's own ICP industries -- what "matches target" is judged against. */
  targetIndustries: string[];
}

export interface FirmographicsProvider {
  name: string;
  /** Never throws -- any failure (network, parsing, no usable result) resolves to null, matching src/lib/contacts's "optional enrichment, safe fallback" contract. */
  lookup(query: FirmographicsQuery): Promise<FirmographicsResult | null>;
}
