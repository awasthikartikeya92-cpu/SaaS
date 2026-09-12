import type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";

/**
 * Fans a query out to several providers and merges their evidence -- e.g.
 * Tavily's general web/news search plus SEC EDGAR's filing search, each
 * finding a different kind of signal from the same taxonomy. One
 * provider's failure doesn't drop the others' results (allSettled), same
 * resilience pattern as everywhere else evidence gets gathered in this
 * pipeline. See src/lib/research/index.ts for how providers get composed.
 */
export class CompositeResearchProvider implements ResearchProvider {
  name: string;

  constructor(private providers: ResearchProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
  }

  async search(query: ResearchQuery): Promise<RawEvidence[]> {
    const results = await Promise.allSettled(this.providers.map((p) => p.search(query)));
    const evidence: RawEvidence[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        evidence.push(...result.value);
      } else {
        console.error("[research] a provider in the composite failed, continuing with the rest:", result.reason);
      }
    }
    return evidence;
  }
}
