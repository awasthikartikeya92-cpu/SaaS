import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { OfferingDnaSchema, parseJson, type OfferingDna } from "./schemas";

export interface OfferingAgentInput {
  name: string;
  website?: string;
  problemsSolved: string;
  outcomes: string;
  differentiators: string;
  competitors?: string;
  knownIcp?: string;
  knownPersonas?: string;
}

const SYSTEM = `You are the Offering Agent inside SignalIQ, an account-intelligence platform.
Convert raw offering input into structured "Offering DNA". Be specific and grounded in what
the user actually described -- never invent capabilities, customers, or statistics that were
not stated or clearly implied. Respond with ONLY a JSON object matching this shape:

{
  "coreProblem": string,
  "capabilities": string[],
  "differentiators": string[],
  "painPoints": string[],
  "buyingTriggers": string[],
  "objections": string[],
  "alternatives": string[],
  "personas": [{ "title": string, "painPoints": string[], "priorities": string[] }]
}`;

export async function runOfferingAgent(input: OfferingAgentInput): Promise<OfferingDna> {
  const provider = getAiProvider();
  const raw = await provider.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify(input, null, 2),
      },
    ],
    model: getModelForAgent("offering-agent"),
  });
  return parseJson(raw, OfferingDnaSchema);
}
