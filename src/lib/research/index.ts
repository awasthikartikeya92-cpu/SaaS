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
  //
  // Previously this fell back to "mock" whenever RESEARCH_PROVIDER was
  // unset, full stop -- so setting TAVILY_API_KEY alone did nothing; you
  // also had to separately set RESEARCH_PROVIDER="tavily", a redundant
  // second step to opt into a real provider you'd already given credentials
  // for. Now, an unset RESEARCH_PROVIDER infers "tavily" when a key is
  // present and only falls back to "mock" when neither is given -- an
  // explicit RESEARCH_PROVIDER still always wins (e.g. to force "mock" for
  // local dev even with a real key sitting in .env).
  const explicitProviderName = (process.env.RESEARCH_PROVIDER || "").toLowerCase().trim();
  const providerName = explicitProviderName || (process.env.TAVILY_API_KEY ? "tavily" : "mock");

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
  //
  // Same auto-detect fix as above, same reasoning: SEC_EDGAR_ENABLED used
  // to require an explicit "true" even when SEC_EDGAR_USER_AGENT was
  // already set -- providing a descriptive User-Agent is itself a clear
  // signal of intent to use this (there's no other reason to set it), so
  // an unset SEC_EDGAR_ENABLED now infers "on" from that. An explicit
  // "false" still disables it outright even with a User-Agent present, for
  // anyone who wants the value on file without the feature active.
  const explicitSecEdgarEnabled = (process.env.SEC_EDGAR_ENABLED || "").toLowerCase().trim();
  const secEdgarEnabled =
    explicitSecEdgarEnabled === "true" || (explicitSecEdgarEnabled === "" && Boolean(process.env.SEC_EDGAR_USER_AGENT));

  const providers: ResearchProvider[] = [primary];
  if (secEdgarEnabled) {
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
