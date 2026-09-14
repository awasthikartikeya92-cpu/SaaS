import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { ContactRecommendationSchema, parseJson, type ContactRecommendation, type OfferingDna, type IcpProfile } from "./schemas";

// Phase 1 runs on mock research data with no person-level enrichment, so this
// agent always falls back to a recommended job title rather than a verified
// person -- exactly the "never invent a contact" rule in the brief. When a
// real people-enrichment source is added in a later phase, a verified branch
// gets added here; the "recommended title, no name" path stays as the floor.
const SYSTEM = `You are the Contact Agent inside SignalIQ. You are given an account, its
industry, and the Offering DNA's buyer personas. You have NO verified person-level data source
available. Recommend the single most relevant job title/persona to target at this account and
explain why -- do NOT invent a person's name. Respond with ONLY a JSON object:
{
  "name": null,
  "title": string,
  "isVerified": false,
  "confidence": number,
  "relevance": string,
  "sourceUrls": []
}`;

export interface ContactAgentInput {
  companyName: string;
  industry?: string | null;
  offeringDna: OfferingDna;
  icp: IcpProfile;
}

export async function runContactAgent(input: ContactAgentInput): Promise<ContactRecommendation> {
  const provider = getAiProvider();
  const { offeringDna, icp, ...accountSpecific } = input;
  const raw = await provider.complete({
    system: SYSTEM,
    // Split so offeringDna+icp -- identical for every account in this
    // campaign, and this agent runs once per account, up to
    // MAX_ACCOUNTS_PER_CAMPAIGN times (orchestrator.ts) -- can be marked
    // cacheable, while the one thing that actually varies per call
    // (companyName/industry) stays uncached. Previously this was one
    // JSON.stringify(input) with the volatile companyName sitting first,
    // which made every byte of every call unique and left nothing for
    // Anthropic's prefix-based caching to match against. See
    // src/lib/ai/provider.ts for how a provider that doesn't support this
    // (OpenAI) just concatenates both segments back into one string.
    messages: [
      {
        role: "user",
        content: [
          { text: `Offering DNA and ICP -- shared context for every account in this campaign:\n${JSON.stringify({ offeringDna, icp }, null, 2)}\n\n`, cacheable: true },
          { text: `Account to evaluate:\n${JSON.stringify(accountSpecific, null, 2)}` },
        ],
      },
    ],
    model: getModelForAgent("contact-agent"),
  });
  const parsed = parseJson(raw, ContactRecommendationSchema);
  return { ...parsed, name: null, isVerified: false }; // enforced floor, not just prompted
}
