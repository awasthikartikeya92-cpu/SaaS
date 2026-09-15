import type { ContactEnrichmentProvider } from "./provider";
import { HunterProvider } from "./hunter-provider";

// `undefined` = not yet resolved; `null` = resolved, deliberately no
// provider configured. Distinct from research/index.ts's factory (which
// throws when misconfigured): contact enrichment is optional infrastructure
// layered on top of a pipeline that already works without it (the Contact
// Agent's recommended-title fallback), not a required one, so "not
// configured" is a normal, silent state, not an error.
let cached: ContactEnrichmentProvider | null | undefined;

export function getContactEnrichmentProvider(): ContactEnrichmentProvider | null {
  if (cached !== undefined) return cached;
  const key = process.env.HUNTER_API_KEY;
  cached = key ? new HunterProvider(key) : null;
  return cached;
}

export type { ContactEnrichmentProvider, EnrichedContact } from "./provider";
