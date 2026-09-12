import { getAiProvider } from "@/lib/ai";
import { SignalTaxonomySchema, parseJson, type SignalTaxonomy, type OfferingDna, type IcpProfile } from "./schemas";

const SYSTEM = `You are the Signal Agent inside SignalIQ. Derive a dynamic taxonomy of PUBLIC
buying/intent signals specific to this offering and ICP -- do not reuse a generic universal
list. Classify each into:
Tier 1 -- direct intent (e.g. a role posting that names the exact capability)
Tier 2 -- strong indirect intent (e.g. leadership change in the relevant function)
Tier 3 -- contextual signals (e.g. company growth/expansion consistent with the buying trigger)
Respond with ONLY a JSON object: { "signals": [{ "name": string, "tier": 1|2|3, "description": string }] }
Produce 8-14 signals spread across the three tiers.`;

export async function runSignalAgent(offeringDna: OfferingDna, icp: IcpProfile): Promise<SignalTaxonomy> {
  const provider = getAiProvider();
  const raw = await provider.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ offeringDna, icp }, null, 2) }],
  });
  return parseJson(raw, SignalTaxonomySchema);
}
