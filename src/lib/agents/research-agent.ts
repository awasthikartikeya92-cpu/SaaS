import { getResearchProvider } from "@/lib/research";
import type { SignalTaxonomy, IcpProfile } from "./schemas";
import type { RawEvidence } from "@/lib/research/provider";

export async function runResearchAgent(taxonomy: SignalTaxonomy, icp: IcpProfile): Promise<RawEvidence[]> {
  const provider = getResearchProvider();
  return provider.search({
    signalNames: taxonomy.signals.map((s) => s.name),
    industries: icp.industries,
    geographies: icp.geographies,
  });
}
