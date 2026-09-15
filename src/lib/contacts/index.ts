import type { ContactEnrichmentProvider } from "./provider";
import { HunterProvider } from "./hunter-provider";
import { TeamPageProvider } from "./team-page-provider";
import { GoogleSearchContactProvider } from "./google-search-provider";
import { CompositeContactEnrichmentProvider } from "./composite-provider";

// `undefined` = not yet resolved; `null` = resolved, deliberately no
// provider configured. Distinct from research/index.ts's factory (which
// throws when misconfigured): contact enrichment is optional infrastructure
// layered on top of a pipeline that already works without it (the Contact
// Agent's recommended-title fallback), not a required one, so "not
// configured" is a normal, silent state, not an error.
let cached: ContactEnrichmentProvider | null | undefined;

export function getContactEnrichmentProvider(): ContactEnrichmentProvider | null {
  if (cached !== undefined) return cached;

  const providers: ContactEnrichmentProvider[] = [];

  // Free, no key -- opt-in via an explicit flag rather than on by default,
  // since unlike the other two this makes a real (if cheap) LLM call and a
  // real (if benign, single-target) outbound fetch per account, a cost
  // profile an operator should consciously choose rather than get for
  // free just by upgrading this codebase.
  if ((process.env.CONTACT_TEAM_PAGE_ENABLED || "").toLowerCase().trim() === "true") {
    providers.push(new TeamPageProvider());
  }

  // Free tier, needs a key -- same auto-detect pattern as
  // src/lib/research/index.ts's Tavily/SEC EDGAR: providing both
  // credentials already says what you want, no separate flag needed.
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;
  if (googleKey && googleCx) {
    providers.push(new GoogleSearchContactProvider(googleKey, googleCx));
  }

  // Commercial, needs a key -- the one of these three worth gating to a
  // paid plan once billing launches (see docs/launch-checklist.md); no
  // such gating exists yet since no plan is priced, so for now this is the
  // same "configured or not" switch as the other two.
  const hunterKey = process.env.HUNTER_API_KEY;
  if (hunterKey) {
    providers.push(new HunterProvider(hunterKey));
  }

  cached = providers.length === 0 ? null : providers.length === 1 ? providers[0] : new CompositeContactEnrichmentProvider(providers);
  return cached;
}

export type { ContactEnrichmentProvider, ContactLookupQuery, EnrichedContact } from "./provider";
