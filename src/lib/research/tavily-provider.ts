import type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";

// Tavily's search API (https://api.tavily.com/search) -- a REST endpoint
// built for exactly this kind of AI-agent search/retrieval use case: send
// a query, get back a handful of results with pre-extracted page content
// (not just a raw SERP), so no separate scraping/extraction step is needed.
//
// I could not verify this against Tavily's live API or docs from this
// environment -- both docs.tavily.com and api.tavily.com are blocked by
// this sandbox's network egress policy (same restriction that blocked
// Postgres and the Anthropic API directly; it doesn't affect the deployed
// app, which runs somewhere with normal network access). This is written
// against Tavily's documented, stable request/response shape from
// training knowledge, with defensive parsing (a missing/renamed field
// degrades gracefully instead of crashing the whole research run) --
// but it has NOT been exercised against a real response. The first real
// campaign run against this is the actual test; if the response shape
// has drifted, check the error logged per failed query below and adjust
// the `parseResult` mapping.

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const RESULTS_PER_QUERY = 5;
// Tight on purpose: the whole generate request has a 60s budget
// (see maxDuration in the generate route) shared with several sequential
// Anthropic calls before and after this step. Run sequentially at the old
// 15s timeout and 5 queries alone could take 75s -- longer than the entire
// function is allowed to run. Queries run in parallel below specifically
// so the wall-clock cost of this step is close to one query's latency,
// not the sum of all of them.
const REQUEST_TIMEOUT_MS = 10_000;

// How many of the signal taxonomy's signals to actually search for per
// research run. Each one is a separate Tavily call -- bounds API usage
// against the free tier and (now that queries run in parallel) the number
// of concurrent requests. Raise it once you've seen real usage and know
// you have headroom on both.
const MAX_SIGNALS_PER_RUN = Number(process.env.TAVILY_MAX_SIGNALS_PER_RUN || 5);

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

export class TavilyProvider implements ResearchProvider {
  name = "tavily";
  constructor(private apiKey: string) {}

  async search(query: ResearchQuery): Promise<RawEvidence[]> {
    const signals = query.signalNames.slice(0, MAX_SIGNALS_PER_RUN);

    // Parallel, not sequential -- see the REQUEST_TIMEOUT_MS comment above.
    // allSettled (not all) so one failing/slow query doesn't sink the
    // others; each query already has its own timeout via searchOne.
    const results = await Promise.allSettled(
      signals.map((signalName) => this.searchOne(buildQuery(signalName, query)).then((r) => ({ signalName, r })))
    );

    const evidence: RawEvidence[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[tavily] search failed for a signal:", result.reason);
        continue; // partial evidence is still useful -- see logRun's own handling downstream
      }
      for (const raw of result.value.r) {
        const parsed = parseResult(raw, result.value.signalName);
        if (parsed) evidence.push(parsed);
      }
    }

    return evidence;
  }

  private async searchOne(query: string): Promise<TavilyResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: "basic",
          topic: "news",
          max_results: RESULTS_PER_QUERY,
          include_answer: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Tavily API returned ${res.status}: ${body.slice(0, 500)}`);
      }

      const data = (await res.json()) as TavilyResponse;
      return Array.isArray(data.results) ? data.results : [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildQuery(signalName: string, query: ResearchQuery): string {
  const industryPart = query.industries.length ? ` in ${query.industries.join(" or ")}` : "";
  const geoPart = query.geographies.length ? ` in ${query.geographies.join(" or ")}` : "";
  return `${signalName}${industryPart}${geoPart} company news`;
}

function parseResult(result: TavilyResult, signalName: string): RawEvidence | null {
  if (!result.url || !result.content) return null;

  let hostname: string;
  try {
    hostname = new URL(result.url).hostname.replace(/^www\./, "");
  } catch {
    return null; // malformed URL -- nothing to attribute this to
  }

  return {
    // Tavily returns web results, not structured company entities -- this
    // is a heuristic (domain -> guessed name), not real entity extraction.
    // Good enough to group evidence by company and show a source link; not
    // as clean as a real firmographics/enrichment source would give you.
    companyName: domainToCompanyName(hostname),
    companyWebsite: hostname,
    url: result.url,
    publishedAt: result.published_date,
    excerpt: result.content.slice(0, 1000),
    signalHint: signalName,
  };
}

function domainToCompanyName(hostname: string): string {
  const label = hostname.split(".")[0];
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
