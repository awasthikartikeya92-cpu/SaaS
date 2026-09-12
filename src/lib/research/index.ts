import type { ResearchProvider } from "./provider";
import { MockResearchProvider } from "./mock-provider";
import { TavilyProvider } from "./tavily-provider";

let cached: ResearchProvider | null = null;

export function getResearchProvider(): ResearchProvider {
  if (cached) return cached;
  // `||` on purpose, not `??` -- see the same comment in src/lib/ai/index.ts.
  const providerName = process.env.RESEARCH_PROVIDER || "mock";

  if (providerName === "mock") {
    cached = new MockResearchProvider();
  } else if (providerName === "tavily") {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw new Error("TAVILY_API_KEY is not set.");
    cached = new TavilyProvider(key);
  } else {
    // Exa/Serper (or another provider) go here behind the same
    // ResearchProvider interface -- nothing above this layer changes.
    throw new Error(`Research provider "${providerName}" is not implemented yet.`);
  }
  return cached;
}

export type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";
