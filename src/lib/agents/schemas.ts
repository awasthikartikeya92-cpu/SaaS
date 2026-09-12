import { z } from "zod";

// --- Small, reusable, defensive primitives -----------------------------
// The goal here isn't stricter validation, it's the opposite: tolerate the
// shapes real models actually produce (a stringified number, a 0-100
// confidence where 0-1 was asked for, a field written as null instead of
// simply omitted or vice versa) so a minor formatting slip doesn't fail an
// entire agent -- and by extension, in orchestrator.ts, an entire account
// or campaign.

/** A number that also accepts a numeric string ("200000") -- rejects anything that isn't actually numeric (NaN/Infinity included) rather than silently coercing to 0. */
const looseNumber = z.preprocess((val) => (typeof val === "string" ? Number(val) : val), z.number().finite());

/** Same, but null/undefined/"" all mean "unknown" rather than a validation failure. */
const nullableNumber = z.preprocess(
  (val) => (val === null || val === undefined || val === "" ? null : val),
  looseNumber.nullable()
);

/** A string field that tolerates the key being entirely omitted, not just explicitly null -- normalized to null either way so the inferred type stays `string | null`, not `string | null | undefined`. */
const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

/** An array of strings that degrades to [] instead of failing the whole record if a model returns the wrong shape (a string instead of an array, non-string entries, or omits the key) -- these are supplementary detail lists, not load-bearing identity fields. */
const looseStringArray = z
  .array(z.string())
  .catch([]);

/** 1|2|3, tolerating a stringified tier ("2") the same way looseNumber does for plain numbers. */
const signalTier = z.preprocess(
  (val) => (typeof val === "string" ? Number(val) : val),
  z.union([z.literal(1), z.literal(2), z.literal(3)])
);

/** 0-1, tolerating a model that answered on a 0-100 scale instead (a very common confusion for "confidence"/"score" fields). */
const unitConfidence = z.preprocess((val) => {
  const n = typeof val === "string" ? Number(val) : val;
  return typeof n === "number" && n > 1 ? n / 100 : n;
}, z.number().min(0).max(1));

// --- Agent output schemas ------------------------------------------------

export const OfferingDnaSchema = z.object({
  coreProblem: z.string(),
  capabilities: looseStringArray,
  differentiators: looseStringArray,
  painPoints: looseStringArray,
  buyingTriggers: looseStringArray,
  objections: looseStringArray,
  alternatives: looseStringArray,
  personas: z
    .array(
      z.object({
        title: z.string(),
        painPoints: looseStringArray,
        priorities: looseStringArray,
      })
    )
    .catch([]),
});
export type OfferingDna = z.infer<typeof OfferingDnaSchema>;

export const IcpProfileSchema = z.object({
  industries: looseStringArray,
  geographies: looseStringArray,
  employeeMin: nullableNumber,
  employeeMax: nullableNumber,
  revenueMin: nullableNumber,
  revenueMax: nullableNumber,
  businessModel: nullableString,
  techCharacteristics: looseStringArray,
  orgCharacteristics: looseStringArray,
  buyingCommittee: looseStringArray,
});
export type IcpProfile = z.infer<typeof IcpProfileSchema>;

export const SignalTaxonomySchema = z.object({
  // Not .catch([]) on purpose -- an empty taxonomy means the Research
  // Agent has nothing to search for at all, which is worth surfacing as a
  // real signal-agent failure rather than silently producing a campaign
  // that will never find any accounts.
  signals: z.array(
    z.object({
      name: z.string(),
      tier: signalTier,
      description: z.string(),
    })
  ),
});
export type SignalTaxonomy = z.infer<typeof SignalTaxonomySchema>;

export const ContactRecommendationSchema = z.object({
  name: nullableString, // null = recommended title only, no verified person (also enforced in code -- see contact-agent.ts)
  title: z.string(),
  isVerified: z.boolean().catch(false),
  confidence: unitConfidence,
  relevance: z.string(),
  sourceUrls: looseStringArray,
});
export type ContactRecommendation = z.infer<typeof ContactRecommendationSchema>;

export const OutreachRecommendationSchema = z.object({
  angle: z.string(),
  talkingPoints: looseStringArray,
  draftEmail: nullableString,
  draftLinkedIn: nullableString,
  callOpener: nullableString,
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
