import { z } from "zod";

export const OfferingDnaSchema = z.object({
  coreProblem: z.string(),
  capabilities: z.array(z.string()),
  differentiators: z.array(z.string()),
  painPoints: z.array(z.string()),
  buyingTriggers: z.array(z.string()),
  objections: z.array(z.string()),
  alternatives: z.array(z.string()),
  personas: z.array(
    z.object({
      title: z.string(),
      painPoints: z.array(z.string()),
      priorities: z.array(z.string()),
    })
  ),
});
export type OfferingDna = z.infer<typeof OfferingDnaSchema>;

export const IcpProfileSchema = z.object({
  industries: z.array(z.string()),
  geographies: z.array(z.string()),
  employeeMin: z.number().nullable(),
  employeeMax: z.number().nullable(),
  revenueMin: z.number().nullable(),
  revenueMax: z.number().nullable(),
  businessModel: z.string().nullable(),
  techCharacteristics: z.array(z.string()),
  orgCharacteristics: z.array(z.string()),
  buyingCommittee: z.array(z.string()),
});
export type IcpProfile = z.infer<typeof IcpProfileSchema>;

export const SignalTaxonomySchema = z.object({
  signals: z.array(
    z.object({
      name: z.string(),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      description: z.string(),
    })
  ),
});
export type SignalTaxonomy = z.infer<typeof SignalTaxonomySchema>;

export const ContactRecommendationSchema = z.object({
  name: z.string().nullable(), // null = recommended title only, no verified person
  title: z.string(),
  isVerified: z.boolean(),
  confidence: z.number().min(0).max(1),
  relevance: z.string(),
  sourceUrls: z.array(z.string()),
});
export type ContactRecommendation = z.infer<typeof ContactRecommendationSchema>;

export const OutreachRecommendationSchema = z.object({
  angle: z.string(),
  talkingPoints: z.array(z.string()),
  draftEmail: z.string().nullable(),
  draftLinkedIn: z.string().nullable(),
  callOpener: z.string().nullable(),
});
export type OutreachRecommendation = z.infer<typeof OutreachRecommendationSchema>;

/**
 * Extracts the first complete top-level JSON object or array from a model
 * response and parses it against the given schema. Models -- especially
 * faster/smaller ones -- don't reliably follow "respond with ONLY a JSON
 * object": a markdown code fence, a leading "Here's the recommendation:",
 * or (seen in production on the fast-tier Contact Agent) a trailing
 * sentence after the JSON are all real failure modes a naive JSON.parse
 * on the whole response breaks on. Finding the first balanced {...} or
 * [...] and parsing only that substring tolerates all three without
 * caring which model produced the response.
 */
export function parseJson<T>(raw: string, schema: { parse: (v: unknown) => T }): T {
  return schema.parse(JSON.parse(extractFirstJsonValue(raw)));
}

function extractFirstJsonValue(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1) {
    throw new Error(`No JSON object or array found in model response: ${trimmed.slice(0, 300)}`);
  }

  const openChar = trimmed[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === openChar) depth++;
    else if (char === closeChar) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  throw new Error(`Unterminated JSON value in model response: ${trimmed.slice(0, 300)}`);
}
