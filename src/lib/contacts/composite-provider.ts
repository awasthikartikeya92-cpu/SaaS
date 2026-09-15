import type { ContactEnrichmentProvider, ContactLookupQuery, EnrichedContact } from "./provider";

/**
 * Fans a lookup out to several enrichment sources and merges their
 * candidates -- e.g. the company's own team page, a search-engine-snippet
 * lookup, and Hunter's domain search, each finding people the others miss.
 * One provider's failure doesn't drop the others' results (allSettled),
 * same resilience pattern as src/lib/research/composite-provider.ts. The
 * merged candidate pool is what rank.ts's pickBestContact() then chooses
 * from -- this class does no ranking of its own.
 */
export class CompositeContactEnrichmentProvider implements ContactEnrichmentProvider {
  name: string;

  constructor(private providers: ContactEnrichmentProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
  }

  async findContacts(query: ContactLookupQuery): Promise<EnrichedContact[]> {
    const results = await Promise.allSettled(this.providers.map((p) => p.findContacts(query)));
    const contacts: EnrichedContact[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        contacts.push(...result.value);
      } else {
        console.error("[contact-enrichment] a provider in the composite failed, continuing with the rest:", result.reason);
      }
    }
    return contacts;
  }
}
