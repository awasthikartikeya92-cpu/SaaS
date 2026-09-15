import type { ContactEnrichmentProvider, ContactLookupQuery, EnrichedContact } from "./provider";

// The classic OSINT technique: rather than scraping LinkedIn directly (a
// third party's site, under its own terms), search a public search engine's
// index of it -- `site:linkedin.com/in "{company}"` -- and read what the
// search engine already shows publicly in its own result snippets. Google's
// Custom Search JSON API is the implementation: it has a genuine free tier
// (100 queries/day) before it's paid, needs an API key plus a Programmable
// Search Engine ID (both from Google, not this codebase), and returns
// exactly the kind of result-title string ("{Name} - {Title} - {Company} |
// LinkedIn") this file parses.
//
// I could not verify this against Google's live API from this environment
// -- googleapis.com is blocked by this sandbox's network egress policy
// (confirmed with a direct curl test, same restriction that blocked every
// other real provider in this codebase). Written against Google Custom
// Search's documented, stable response shape from training knowledge. The
// one detail that's genuinely uncertain here -- not a fact I got wrong, but
// a fact that varies and can't be pinned down in advance -- is LinkedIn's
// own result-title format, which Google mirrors verbatim from LinkedIn's
// page title and which LinkedIn could change at any time. parseLinkedInResultTitle
// below handles the two documented common shapes and returns null (skips
// that result, not a guess) for anything else -- see its own comment for
// exactly what it does and doesn't handle, and adjust the regexes there
// first if hit rates seem low after a real campaign run.
const GOOGLE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 10; // Custom Search returns up to 10 results per request
// Lower than TeamPageProvider's 0.65 -- this is a step further removed from
// the source (a search engine's cached snippet of a third-party profile,
// parsed by regex) with no independent verification either.
const CONFIDENCE = 0.55;

interface GoogleSearchItem {
  title?: string;
  link?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

export class GoogleSearchContactProvider implements ContactEnrichmentProvider {
  name = "google-search";
  constructor(
    private apiKey: string,
    private searchEngineId: string
  ) {}

  async findContacts({ companyName }: ContactLookupQuery): Promise<EnrichedContact[]> {
    const query = `site:linkedin.com/in "${companyName}"`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url =
        `${GOOGLE_SEARCH_URL}?key=${encodeURIComponent(this.apiKey)}` +
        `&cx=${encodeURIComponent(this.searchEngineId)}` +
        `&q=${encodeURIComponent(query)}&num=${MAX_RESULTS}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Google Custom Search returned ${res.status}: ${body.slice(0, 500)}`);
      }

      const data = (await res.json()) as GoogleSearchResponse;
      const items = data.items;
      if (!Array.isArray(items)) return [];

      const contacts: EnrichedContact[] = [];
      for (const item of items) {
        if (!item.title) continue;
        const parsed = parseLinkedInResultTitle(item.title);
        if (!parsed) continue;
        contacts.push({ name: parsed.name, title: parsed.title, email: null, linkedinUrl: item.link ?? null, confidence: CONFIDENCE });
      }
      return contacts;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Parses LinkedIn's own search-result title format, as Google's index
 * mirrors it verbatim. Handles the two documented common shapes:
 * "{Name} - {Title} - {Company} | LinkedIn" and
 * "{Name} - {Title} at {Company} | LinkedIn". Returns null -- never a
 * guess -- for anything else, including a result with no title segment at
 * all ("{Name} - {Company} | LinkedIn" or bare "{Name} | LinkedIn"), which
 * is common and simply unusable here since a name with no title fails the
 * same "both required" rule every contact source in this codebase follows.
 * Requires whitespace around a splitting hyphen specifically so it doesn't
 * misfire on a hyphenated title word (e.g. "Co-Founder" has no spaces
 * around its hyphen, so it's never mistaken for a segment boundary).
 */
export function parseLinkedInResultTitle(rawTitle: string): { name: string; title: string } | null {
  const cleaned = rawTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();

  const threePart = cleaned.match(/^(.+?)\s+-\s+(.+?)\s+-\s+.+$/);
  if (threePart) return { name: threePart[1].trim(), title: threePart[2].trim() };

  const atPart = cleaned.match(/^(.+?)\s+-\s+(.+?)\s+at\s+.+$/i);
  if (atPart) return { name: atPart[1].trim(), title: atPart[2].trim() };

  return null;
}
