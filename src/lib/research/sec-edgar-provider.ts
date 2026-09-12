import type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";

// SEC EDGAR's full-text search (EFTS) -- free, no API key, searches the
// actual text of 10-K/10-Q/8-K filings. This is the intentional counterpart
// to Tavily's general web/news search: Tavily finds news chatter about a
// company; this finds what a public company has itself formally disclosed
// (a capex increase, a new risk factor, an 8-K material agreement) that
// implies a buying need in a given category. It only covers accounts that
// are SEC-registered public filers -- most SMB targets won't appear here at
// all, but plenty of SMB *customers'* own target accounts (their ICP) are
// large, public enterprises, which is exactly the case this is for. See
// docs/launch-checklist.md.
//
// I could not verify this against a live response from this sandbox --
// efts.sec.gov is blocked by the same network egress policy that blocked
// Tavily and Postgres earlier (confirmed with a direct curl test, same as
// the check done for those). Written against SEC EDGAR's documented,
// stable full-text-search JSON API from training knowledge, with the same
// defensive-parsing discipline as tavily-provider.ts -- a missing/renamed
// field degrades gracefully (that hit is skipped, not a crash), and one
// specific detail I'm NOT confident about (whether a hit carries a
// highlighted text snippet, and under what field name) is handled by
// trying a couple of plausible field names and falling back to an honest,
// non-fabricated description if none are present -- see parseHit() below.
// The first real campaign run with SEC_EDGAR_ENABLED=true is the actual
// test; if hits come back empty or malformed, check the error logged per
// failed query and adjust parseHit()/buildSearchUrl() to match reality.

const EFTS_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const RESULTS_PER_QUERY = 5;
const REQUEST_TIMEOUT_MS = 10_000;

// Same reasoning as TAVILY_MAX_SIGNALS_PER_RUN: bounds API usage and, now
// that queries run in parallel (see search() below), the number of
// concurrent requests -- not that EDGAR is metered like Tavily, but SEC's
// fair-access policy asks for a reasonable request rate, and there's no
// reason to hammer it harder than Tavily gets hammered for the same job.
const MAX_SIGNALS_PER_RUN = Number(process.env.SEC_EDGAR_MAX_SIGNALS_PER_RUN || 5);

// Only 10-K (annual), 10-Q (quarterly), and 8-K (material/current events --
// leadership changes, major agreements, restructurings) -- these are where
// language implying a buying need actually shows up. Excluding proxy
// statements, S-1s, etc. keeps queries focused and keeps result volume
// manageable within RESULTS_PER_QUERY.
const FORMS = "10-K,10-Q,8-K";

interface EdgarHit {
  _id?: string;
  _source?: {
    display_names?: string[];
    file_date?: string;
    file_type?: string;
    root_form?: string;
    cik?: string | string[];
    // Plausible-but-unverified snippet field names -- SEC's own search UI
    // (sec.gov/edgar/search) shows a highlighted excerpt, but I don't have
    // a confirmed field name for it in the raw JSON from training
    // knowledge alone. Tried in this order in parseHit(); if none are
    // present, an honest non-fabricated description is used instead of
    // guessing at filing content.
    ic?: string;
    highlight?: string | string[];
  };
}

interface EdgarSearchResponse {
  hits?: { hits?: EdgarHit[] };
}

export class SecEdgarProvider implements ResearchProvider {
  name = "sec-edgar";
  private userAgent: string;

  constructor(userAgent: string) {
    this.userAgent = userAgent;
  }

  async search(query: ResearchQuery): Promise<RawEvidence[]> {
    const signals = query.signalNames.slice(0, MAX_SIGNALS_PER_RUN);

    // Parallel + allSettled: same reasoning as TavilyProvider -- one slow
    // or failing query shouldn't sink the others, and this needs to stay
    // well inside the calling step's time budget (see
    // src/lib/agents/orchestrator.ts's stepResearchAndSeedAccounts, which
    // has no LLM call of its own and should stay fast).
    const results = await Promise.allSettled(
      signals.map((signalName) => this.searchOne(signalName).then((hits) => ({ signalName, hits })))
    );

    const evidence: RawEvidence[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[sec-edgar] search failed for a signal:", result.reason);
        continue;
      }
      for (const hit of result.value.hits) {
        const parsed = parseHit(hit, result.value.signalName);
        if (parsed) evidence.push(parsed);
      }
    }

    return evidence;
  }

  private async searchOne(signalName: string): Promise<EdgarHit[]> {
    const url = `${EFTS_SEARCH_URL}?q=${encodeURIComponent(`"${signalName}"`)}&forms=${FORMS}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          // SEC's fair-access policy requires a descriptive User-Agent
          // identifying the requester on every request -- a missing or
          // generic one ("Mozilla/5.0"...) gets blocked/rate-limited, not
          // just discouraged. See SEC_EDGAR_USER_AGENT in .env.example.
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`SEC EDGAR search returned ${res.status}: ${body.slice(0, 500)}`);
      }

      const data = (await res.json()) as EdgarSearchResponse;
      const hits = data.hits?.hits;
      return Array.isArray(hits) ? hits.slice(0, RESULTS_PER_QUERY) : [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseHit(hit: EdgarHit, signalName: string): RawEvidence | null {
  const source = hit._source;
  if (!source) return null;

  const rawName = source.display_names?.[0];
  if (!rawName) return null; // nothing to attribute this filing to
  // display_names looks like "Apple Inc. (AAPL)" -- strip the ticker for a
  // clean company name; this is the company's actual registered name from
  // SEC records, not a domain-guessed heuristic like Tavily's fallback.
  const companyName = rawName.replace(/\s*\([A-Z.]{1,8}\)\s*$/, "").trim();

  const formType = source.file_type || source.root_form || "filing";
  const filingDate = source.file_date;

  // Try the plausible snippet field names first; if none are present,
  // describe what's actually known (a real filing, of a real type, on a
  // real date, that matched this search term) rather than inventing quoted
  // text that was never verified against the actual filing body. This
  // still clears the Verification Agent's MIN_EXCERPT_LENGTH easily and,
  // unlike a fabricated quote, is true regardless of whether the snippet
  // field guess above was right.
  const snippet = firstNonEmpty(source.highlight, source.ic);
  const excerpt =
    snippet ??
    `${companyName} filed a ${formType} on ${filingDate ?? "an undisclosed date"} matching the search term "${signalName}".`;

  return {
    companyName,
    url: buildFilingUrl(hit._id, source.cik) ?? "https://www.sec.gov/edgar/search/",
    publishedAt: filingDate,
    excerpt,
    signalHint: signalName,
  };
}

function firstNonEmpty(...values: (string | string[] | undefined)[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && v[0]?.trim()) return v[0].trim();
  }
  return undefined;
}

/**
 * Builds a direct link to the filing document. `_id` is documented as
 * `"<accession-number>:<primary-document-filename>"` (e.g.
 * "0000320193-23-000106:aapl-20230930.htm"); the canonical Archives URL
 * needs the CIK without leading zeros and the accession number without
 * dashes. Falls back to the company's general filing-list page (always
 * constructible from the CIK alone) if `_id` isn't in the expected shape --
 * a real, working link either way, never a broken one.
 */
function buildFilingUrl(id: string | undefined, cik: string | string[] | undefined): string | null {
  const cikValue = Array.isArray(cik) ? cik[0] : cik;
  const [accession, doc] = (id ?? "").split(":");
  if (cikValue && accession && doc && /^\d{10}-\d{2}-\d{6}$/.test(accession)) {
    const cikNoLeadingZeros = cikValue.replace(/^0+/, "") || "0";
    return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accession.replace(/-/g, "")}/${doc}`;
  }
  if (cikValue) {
    return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikValue}&type=10-K`;
  }
  return null;
}
