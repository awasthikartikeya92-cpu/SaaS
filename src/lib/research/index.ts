import type { ResearchProvider } from "./provider";
import { MockResearchProvider } from "./mock-provider";

let cached: ResearchProvider | null = null;

export function getResearchProvider(): ResearchProvider {
  if (cached) return cached;
  const providerName = process.env.RESEARCH_PROVIDER ?? "mock";

  if (providerName === "mock") {
    cached = new MockResearchProvider();
  } else {
    // Phase 2: register real providers (Tavily/Exa/Serper) here behind the
    // same ResearchProvider interface.
    throw new Error(
      `Research provider "${providerName}" is not implemented yet -- Phase 1 ships "mock" only.`
    );
  }
  return cached;
}

export type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";
