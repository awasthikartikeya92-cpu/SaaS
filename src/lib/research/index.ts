import type { ResearchProvider } from "./provider";
import { MockResearchProvider } from "./mock-provider";
import { TavilyProvider } from "./tavily-provider";
import { SecEdgarProvider } from "./sec-edgar-provider";
import { CompositeResearchProvider } from "./composite-provider";

let cached: ResearchProvider | null = null;

export function getResearchProvider(): ResearchProvider {
  if (cached) return cached;
  // `||` on purpose, not `??`, and normalized the same way -- see the same
  // comments in src/lib/ai/index.ts.
  const providerName = (process.env.RESEARCH_PROVIDER || "mock").toLowerCase().trim();

  let primary: ResearchProvider;
  if (providerName === "mock") {
    primary = new MockResearchProvider();
  } else if (providerName === "tavily") {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw new Error("TAVILY_API_KEY is not set.");
    primary = new TavilyProvider(key);
  } else {
    // Exa/Serper (or another provider) go here behind the same
    // ResearchProvider interface -- nothing above this layer changes.
    throw new Error(`Research provider "${providerName}" is not implemented yet.`);
  }

  // SEC EDGAR is additive, not a replacement for RESEARCH_PROVIDER -- it
  // finds a different kind of signal (what a public company has formally
  // disclosed in a filing) than Tavily's general web/news search, so both
  // run and their evidence gets merged rather than one being chosen over
  // the other. Independent on/off switch since it costs nothing (no API
  // key, no per-request charge) and most target accounts won't be public
  // filers anyway -- see docs/launch-checklist.md.
  const providers: ResearchProvider[] = [primary];
  if ((process.env.SEC_EDGAR_ENABLED || "").toLowerCase().trim() === "true") {
    const userAgent = process.env.SEC_EDGAR_USER_AGENT;
    if (!userAgent) {
      throw new Error(
        "SEC_EDGAR_ENABLED is true but SEC_EDGAR_USER_AGENT is not set. SEC requires a descriptive " +
          'User-Agent identifying you on every request (e.g. "SignalIQ contact@yourcompany.com") -- ' +
          "a missing or generic one gets blocked, not just discouraged."
      );
    }
    providers.push(new SecEdgarProvider(userAgent));
  }

  cached = providers.length === 1 ? providers[0] : new CompositeResearchProvider(providers);
  return cached;
}

export type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";
