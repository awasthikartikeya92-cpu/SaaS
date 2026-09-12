import { getAiProvider } from "@/lib/ai";
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
  const raw = await provider.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
  });
  const parsed = parseJson(raw, ContactRecommendationSchema);
  return { ...parsed, name: null, isVerified: false }; // enforced floor, not just prompted
}
