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

/** Strips markdown code fences some models wrap JSON in, then parses. */
export function parseJson<T>(raw: string, schema: { parse: (v: unknown) => T }): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return schema.parse(JSON.parse(cleaned));
}
