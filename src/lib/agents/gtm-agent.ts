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
  const { offeringDna, ...accountSpecific } = input;
  const raw = await provider.complete({
    system: SYSTEM,
    // Same split as contact-agent.ts, same reasoning: offeringDna is
    // identical for every account in this campaign; companyName/signals/
    // recommendedTitle are what actually change per call. See
    // src/lib/ai/provider.ts's AiMessage.content comment.
    messages: [
      {
        role: "user",
        content: [
          { text: `Offering DNA -- shared context for every account in this campaign:\n${JSON.stringify({ offeringDna }, null, 2)}\n\n`, cacheable: true },
          { text: `Account and signals to build outreach for:\n${JSON.stringify(accountSpecific, null, 2)}` },
        ],
      },
    ],
    model: getModelForAgent("gtm-agent"),
    // Same reasoning as offering-agent.ts -- draftEmail/draftLinkedIn/
    // callOpener together can run long enough to risk truncating the
    // default 4096-token ceiling mid-JSON.
    maxTokens: 8192,
  });
  return parseJson(raw, OutreachRecommendationSchema);
}
