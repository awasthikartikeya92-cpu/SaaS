// Research provider abstraction. Phase 1 ships a MockResearchProvider so the
// full pipeline (search -> retrieve -> extract -> evidence) can be built and
// demoed without a paid API key. Phase 2 adds a real provider (Tavily/Exa/
// Serper) implementing this same interface -- nothing above this layer
// changes.

export interface RawEvidence {
  companyName: string;
  companyWebsite?: string;
  url: string;
  publishedAt?: string; // ISO date, when known
  excerpt: string;
  signalHint: string; // free-text description of what this evidence suggests
}

export interface ResearchQuery {
  /** The signal taxonomy entries to search against. */
  signalNames: string[];
  industries: string[];
  geographies: string[];
}

export interface ResearchProvider {
  name: string;
  search(query: ResearchQuery): Promise<RawEvidence[]>;
}
