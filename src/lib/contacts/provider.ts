// Contact enrichment provider abstraction -- mirrors src/lib/research/provider.ts
// deliberately: same shape (an interface, a real implementation behind an
// env-var switch, nothing above this layer caring which is active). This one
// answers a narrower question than Research does: given a company's domain,
// who are real, named people who actually work there, with what titles.
//
// This is a genuinely different kind of data than everything else the
// pipeline produces. Every other agent either derives structure from what
// the user told us (Offering/ICP/Signal) or filters/scores evidence about a
// company as a whole (Research/Verification). This is the first place
// SignalIQ handles data about a *named individual* who is not a user of the
// product -- see legal/privacy.md's "Information about people who are not
// our users" section, updated alongside this to describe it accurately.

export interface EnrichedContact {
  name: string;
  title: string;
  email: string | null;
  linkedinUrl: string | null;
  /** 0-1, the provider's own confidence in this specific match -- never fabricated, always passed through from the source. */
  confidence: number;
}

export interface ContactEnrichmentProvider {
  name: string;
  /** `domain` is a bare hostname (no protocol), e.g. "acme.com". */
  findContacts(domain: string): Promise<EnrichedContact[]>;
}
