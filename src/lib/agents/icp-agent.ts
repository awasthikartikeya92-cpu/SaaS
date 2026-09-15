import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { IcpProfileSchema, parseJson, type IcpProfile, type OfferingDna } from "./schemas";

export interface IcpAgentInput {
  offeringDna: OfferingDna;
  targetIndustries: string[];
  targetGeographies: string[];
  targetCompanySize?: string;
  knownIcp?: string;
}

const SYSTEM = `You are the ICP Agent inside SignalIQ. Given Offering DNA and the user's stated
targeting, produce a structured Ideal Customer Profile. Ground every field in the input --
if the user gave explicit industries/geographies, respect them rather than inventing new ones.
Respond with ONLY a JSON object matching this shape:

{
  "industries": string[],
  "geographies": string[],
  "employeeMin": number | null,
  "employeeMax": number | null,
  "revenueMin": number | null,
  "revenueMax": number | null,
  "businessModel": string | null,
  "techCharacteristics": string[],
  "orgCharacteristics": string[],
  "buyingCommittee": string[]
}`;

export async function runIcpAgent(input: IcpAgentInput): Promise<IcpProfile> {
  const provider = getAiProvider();
  const raw = await provider.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    model: getModelForAgent("icp-agent"),
    // Same reasoning as offering-agent.ts's maxTokens override: the default
    // 4096 risks truncating mid-JSON on a detailed ICP (long characteristic
    // lists, a large buying committee), and a truncated response fails
    // parseJson the same way a malformed one does.
    maxTokens: 8192,
  });
  return parseJson(raw, IcpProfileSchema);
}
