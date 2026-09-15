import type { ContactEnrichmentProvider, EnrichedContact } from "./provider";

// Hunter.io's Domain Search API (https://api.hunter.io/v2/domain-search) --
// given a company domain, returns real people Hunter has found associated
// with it (from public sources: company websites, professional profiles),
// each with a name, position, and Hunter's own per-contact confidence score.
// Chosen specifically because it has a genuine free tier (no forced paid
// plan to try this), and because "find real people at a real domain" is
// exactly the question this pipeline needs answered -- unlike a general
// people-search API, this one's whole purpose is company-domain lookup.
//
// I could not verify this against Hunter's live API or docs from this
// environment -- api.hunter.io is blocked by this sandbox's network egress
// policy (confirmed with a direct curl test, same restriction that blocked
// Tavily, SEC EDGAR, and Postgres earlier; it doesn't affect the deployed
// app, which runs somewhere with normal network access). This is written
// against Hunter's documented, stable Domain Search response shape from
// training knowledge, with the same defensive-parsing discipline as
// tavily-provider.ts/sec-edgar-provider.ts -- a missing/renamed field
// degrades gracefully (that candidate is skipped, not a crash). The first
// real campaign run with HUNTER_API_KEY set is the actual test; if results
// come back empty or malformed, check the error logged per failed request
// and adjust parseCandidate() to match reality.

const HUNTER_DOMAIN_SEARCH_URL = "https://api.hunter.io/v2/domain-search";
const REQUEST_TIMEOUT_MS = 10_000;
// Hunter caps how many contacts a single Domain Search call returns; this
// bounds it further so one lookup can't come back with an unreasonably long
// list to rank through -- see rank.ts for what happens to these candidates.
const MAX_CANDIDATES = 25;

interface HunterEmailEntry {
  value?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  confidence?: number; // Hunter's own 0-100 scale
  linkedin?: string | null;
}

interface HunterDomainSearchResponse {
  data?: {
    emails?: HunterEmailEntry[];
  };
}

export class HunterProvider implements ContactEnrichmentProvider {
  name = "hunter";
  constructor(private apiKey: string) {}

  async findContacts(domain: string): Promise<EnrichedContact[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${HUNTER_DOMAIN_SEARCH_URL}?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(this.apiKey)}&limit=${MAX_CANDIDATES}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Hunter Domain Search returned ${res.status}: ${body.slice(0, 500)}`);
      }

      const data = (await res.json()) as HunterDomainSearchResponse;
      const entries = data.data?.emails;
      if (!Array.isArray(entries)) return [];

      const contacts: EnrichedContact[] = [];
      for (const entry of entries) {
        const parsed = parseCandidate(entry);
        if (parsed) contacts.push(parsed);
      }
      return contacts;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseCandidate(entry: HunterEmailEntry): EnrichedContact | null {
  // A candidate with no position at all is useless for this pipeline --
  // there's nothing to match against the offering's buyer personas, and
  // "an unnamed role exists at this company" isn't a recommendation.
  const title = entry.position?.trim();
  if (!title) return null;

  const first = entry.first_name?.trim() ?? "";
  const last = entry.last_name?.trim() ?? "";
  const name = `${first} ${last}`.trim();
  if (!name) return null; // a title with no name attached isn't a verified person

  // Hunter's confidence is 0-100; every confidence value elsewhere in this
  // codebase (contact-agent.ts, the Verification Agent) is 0-1 -- normalize
  // here so callers never have to remember which scale this one source uses.
  const rawConfidence = typeof entry.confidence === "number" ? entry.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence / 100));

  return {
    name,
    title,
    email: entry.value?.trim() || null,
    linkedinUrl: entry.linkedin?.trim() || null,
    confidence,
  };
}
