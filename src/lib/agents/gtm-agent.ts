import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { OutreachRecommendationSchema, parseJson, type OutreachRecommendation, type OfferingDna } from "./schemas";
import type { VerifiedSignal } from "./verification-agent";

const SYSTEM = `You are the GTM Strategist inside SignalIQ. Given an account's verified public
signals and the offering's value proposition, recommend an outreach angle. Base the angle ONLY
on the signals and offering info given -- do not claim knowledge of private intent. Respond with
ONLY a JSON object:
{
  "angle": string,
  "talkingPoints": string[],
  "draftEmail": string | null,
  "draftLinkedIn": string | null,
  "callOpener": string | null
}`;

export interface GtmAgentInput {
  companyName: string;
  signals: VerifiedSignal[];
  offeringDna: OfferingDna;
  recommendedTitle: string;
}

export async function runGtmAgent(input: GtmAgentInput): Promise<OutreachRecommendation> {
  const provider = getAiProvider();
  const raw = await provider.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    model: getModelForAgent("gtm-agent"),
  });
  return parseJson(raw, OutreachRecommendationSchema);
}
