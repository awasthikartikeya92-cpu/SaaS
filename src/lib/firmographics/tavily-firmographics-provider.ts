import { z } from "zod";
import type { FirmographicsProvider, FirmographicsQuery, FirmographicsResult } from "./provider";
import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { parseJson } from "@/lib/agents/schemas";

// Reuses the same Tavily search API research-agent's own TavilyProvider
// calls (see src/lib/research/tavily-provider.ts's own comment on the
// endpoint/response shape and why this couldn't be verified against a live
// response from this sandbox) -- no new API key required beyond the one a
// campaign already needs for real research. What's different here: instead
// of treating "the domain of whatever page ranked for a signal query" as
// the company's own identity (research's actual entity-resolution gap --
// see orchestrator.ts's stepContact comment on why that surfaced accounts
// like a talent marketplace under a "Banking & Finance" campaign), this
// runs one targeted, company-named search and asks a model to extract only
// what a real source says about THIS company -- grounded extraction, same
// "never invent" discipline as team-page-provider.ts, not the Contact
// Agent's own recommendation path.
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 10_000;

const ResultSchema = z.object({
  // null (not a bare JSON `null`) represents "couldn't determine" --
  // src/lib/agents/schemas.ts's parseJson requires the top-level JSON
  // value to be an object or array, so the model can't respond with a
  // literal `null` here the way team-page-provider's schema allows for an
  // empty array.
  industry: z.string().nullable().catch(null),
  industryMatchesTarget: z.boolean().catch(false),
  employeeRange: z.string().nullable().catch(null),
  revenueRange: z.string().nullable().catch(null),
});

const SYSTEM = `You classify a company's real industry from search-result text about it, and judge
whether that industry plausibly falls under a given list of target industries. Base your answer ONLY
on what the provided text actually says about this specific company -- never guess from the company
name alone (a name can be generic or misleading), and never invent an employee count or revenue figure
that isn't stated or directly implied by the text. If the text doesn't clearly identify what the
company actually does, set "industry" to null and "industryMatchesTarget" to false rather than
guessing. Respond with ONLY JSON:
{ "industry": string|null, "industryMatchesTarget": boolean, "employeeRange": string|null, "revenueRange": string|null }
employeeRange/revenueRange should be approximate ranges exactly as stated or reasonably summarized
from the text (e.g. "51-200 employees", "$10M-$50M revenue"), or null if the text doesn't say.`;

export class TavilyFirmographicsProvider implements FirmographicsProvider {
  name = "tavily-firmographics";
  constructor(private apiKey: string) {}

  async lookup({ companyName, website, targetIndustries }: FirmographicsQuery): Promise<FirmographicsResult | null> {
    try {
      const query = website
        ? `"${companyName}" (${website}) company profile industry employees revenue`
        : `"${companyName}" company profile industry employees revenue`;

      const hit = await this.searchOne(query);
      if (!hit) return null;

      const raw = await getAiProvider().complete({
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Company: ${companyName}\nTarget industries: ${targetIndustries.join(", ") || "(none specified)"}\n\nSearch result text:\n${hit.content}`,
          },
        ],
        model: getModelForAgent("firmographics-agent"),
      });

      const parsed = parseJson(raw, ResultSchema);
      if (!parsed.industry) return null; // couldn't determine -- degrade gracefully, don't guess

      return {
        industry: parsed.industry,
        industryMatchesTarget: parsed.industryMatchesTarget,
        employeeRange: parsed.employeeRange,
        revenueRange: parsed.revenueRange,
        sourceUrl: hit.url,
        sourceExcerpt: hit.content.slice(0, 500),
      };
    } catch (err) {
      // Same contract as tryFindVerifiedContact in orchestrator.ts: a
      // flaky third-party lookup or a malformed model response must never
      // turn into an account failure -- this is additive enrichment on a
      // pipeline that already works without it.
      console.error("[firmographics] lookup failed:", err);
      return null;
    }
  }

  private async searchOne(query: string): Promise<{ url: string; content: string } | null> {
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
          max_results: 1,
          include_answer: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;

      const data = (await res.json()) as { results?: { url?: string; content?: string }[] };
      const top = data.results?.[0];
      if (!top?.url || !top.content) return null;
      return { url: top.url, content: top.content.slice(0, 2000) };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
