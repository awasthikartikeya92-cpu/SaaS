// SignalIQ schema (Drizzle ORM, Postgres). Phase 1 ran this on SQLite for
// local/demo purposes (network-restricted sandbox at the time couldn't reach
// a real Postgres instance or Prisma's engine binary) -- see git history if
// you need that version. Now that a real Postgres instance is provisioned
// (Vercel's Prisma Postgres storage add-on), this is the live schema for
// both local dev and production; there's no more SQLite fallback.

import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date());

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  // Billing/plan fields. `plan` gates campaign creation (see
  // src/lib/billing/quota.ts); the stripe* columns are null until an org has
  // actually gone through Checkout (src/app/api/billing/checkout/route.ts).
  plan: text("plan").notNull().default("free"), // see src/lib/billing/plans.ts for plan ids
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // active | past_due | canceled | ...
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  organizationId: text("organization_id").notNull(),
  createdAt: createdAt(),
});

export const credentials = pgTable("credentials", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  provider: text("provider").notNull(), // "anthropic" | "openai" | "tavily" | ...
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: createdAt(),
});

export const campaigns = pgTable("campaigns", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  website: text("website"),
  problemsSolved: text("problems_solved").notNull(),
  outcomes: text("outcomes").notNull(),
  differentiators: text("differentiators").notNull(),
  targetIndustries: jsonb("target_industries").$type<string[]>().notNull(),
  targetGeographies: jsonb("target_geographies").$type<string[]>().notNull(),
  targetCompanySize: text("target_company_size"),
  knownIcp: text("known_icp"),
  knownPersonas: text("known_personas"),
  competitors: text("competitors"),
  status: text("status").notNull().default("draft"), // draft | generating | active | archived
  createdAt: createdAt(),
});

export const offeringDna = pgTable("offering_dna", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  coreProblem: text("core_problem").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  differentiators: jsonb("differentiators").$type<string[]>().notNull(),
  painPoints: jsonb("pain_points").$type<string[]>().notNull(),
  buyingTriggers: jsonb("buying_triggers").$type<string[]>().notNull(),
  objections: jsonb("objections").$type<string[]>().notNull(),
  alternatives: jsonb("alternatives").$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const buyerPersonas = pgTable("buyer_personas", {
  id: id(),
  offeringDnaId: text("offering_dna_id").notNull(),
  title: text("title").notNull(),
  painPoints: jsonb("pain_points").$type<string[]>().notNull(),
  priorities: jsonb("priorities").$type<string[]>().notNull(),
});

export const icpProfiles = pgTable("icp_profiles", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  industries: jsonb("industries").$type<string[]>().notNull(),
  geographies: jsonb("geographies").$type<string[]>().notNull(),
  employeeMin: integer("employee_min"),
  employeeMax: integer("employee_max"),
  revenueMin: integer("revenue_min"),
  revenueMax: integer("revenue_max"),
  businessModel: text("business_model"),
  techCharacteristics: jsonb("tech_characteristics").$type<string[]>().notNull(),
  orgCharacteristics: jsonb("org_characteristics").$type<string[]>().notNull(),
  buyingCommittee: jsonb("buying_committee").$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const signalTaxonomies = pgTable("signal_taxonomies", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  generatedAt: createdAt(),
});

export const signalDefinitions = pgTable("signal_definitions", {
  id: id(),
  taxonomyId: text("taxonomy_id").notNull(),
  name: text("name").notNull(),
  tier: integer("tier").notNull(), // 1 direct, 2 strong indirect, 3 contextual
  description: text("description").notNull(),
});

export const accounts = pgTable("accounts", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  companyName: text("company_name").notNull(),
  website: text("website"),
  industry: text("industry"),
  employeeCount: integer("employee_count"),
  geography: text("geography"),
  createdAt: createdAt(),
});

export const accountScores = pgTable("account_scores", {
  id: id(),
  accountId: text("account_id").notNull().unique(),
  icpFit: doublePrecision("icp_fit").notNull(),
  intent: doublePrecision("intent").notNull(),
  reachability: doublePrecision("reachability").notNull(),
  opportunity: doublePrecision("opportunity").notNull(),
  computedAt: createdAt(),
});

export const researchRuns = pgTable("research_runs", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  agent: text("agent").notNull(),
  status: text("status").notNull(), // running | success | error
  input: jsonb("input").$type<unknown>().notNull(),
  output: jsonb("output").$type<unknown>(),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at", { mode: "date" }),
});

export const researchSources = pgTable("research_sources", {
  id: id(),
  researchRunId: text("research_run_id").notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at", { mode: "date" }),
  retrievedAt: createdAt(),
  excerpt: text("excerpt").notNull(),
});

export const accountSignals = pgTable("account_signals", {
  id: id(),
  accountId: text("account_id").notNull(),
  signalName: text("signal_name").notNull(),
  tier: integer("tier").notNull(),
  strength: doublePrecision("strength").notNull(), // 0-100
  confidence: doublePrecision("confidence").notNull(), // 0-1
  detectedAt: timestamp("detected_at", { mode: "date" }).notNull(),
  publishedAt: timestamp("published_at", { mode: "date" }),
  verified: boolean("verified").notNull().default(false),
  evidence: text("evidence").notNull(),
  sourceId: text("source_id").notNull(),
});

export const contacts = pgTable("contacts", {
  id: id(),
  accountId: text("account_id").notNull(),
  name: text("name"), // null when this is a recommended title, not a verified person
  title: text("title").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  confidence: doublePrecision("confidence").notNull(),
  relevance: text("relevance").notNull(),
});

export const contactSources = pgTable("contact_sources", {
  id: id(),
  contactId: text("contact_id").notNull(),
  url: text("url").notNull(),
  detectedAt: createdAt(),
});

export const outreachRecommendations = pgTable("outreach_recommendations", {
  id: id(),
  accountId: text("account_id").notNull(),
  angle: text("angle").notNull(),
  talkingPoints: jsonb("talking_points").$type<string[]>().notNull(),
  draftEmail: text("draft_email"),
  draftLinkedIn: text("draft_linked_in"),
  callOpener: text("call_opener"),
  generatedAt: createdAt(),
});

export const reports = pgTable("reports", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  createdAt: createdAt(),
});

export const exportsTable = pgTable("exports", {
  id: id(),
  reportId: text("report_id").notNull(),
  format: text("format").notNull(), // pdf | docx | csv
  fileUrl: text("file_url").notNull(),
  createdAt: createdAt(),
});

export const usage = pgTable("usage", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  metric: text("metric").notNull(),
  amount: integer("amount").notNull(),
  periodStart: timestamp("period_start", { mode: "date" }).notNull(),
});

// Per-LLM-call usage log, written by src/lib/billing/usage-tracking.ts (via
// the AsyncLocalStorage context in src/lib/ai/usage-context.ts) every time an
// AI provider call returns. This is the raw data behind unit-economics
// decisions (cost per campaign, free-tier sizing, plan pricing) -- see
// docs/launch-checklist.md. Token counts come straight from the provider's
// API response, so they're ground truth; `estimatedCostUsd` is only as good
// as the rates in src/lib/billing/pricing-config.ts and is null when a
// model isn't in that table yet.
// Crude, IP-based signup throttle (src/lib/auth/rate-limit.ts). This is a
// deterrent, not a real defense -- an attacker who rotates IPs still gets
// through -- but it raises the bar above "one HTTP request per free org"
// against the per-organization campaign quota, without requiring an email
// provider or CAPTCHA service. Real abuse prevention (email verification,
// CAPTCHA) is a documented follow-up in docs/launch-checklist.md.
export const signupAttempts = pgTable("signup_attempts", {
  id: id(),
  ipAddress: text("ip_address").notNull(),
  createdAt: createdAt(),
});

export const aiUsageEvents = pgTable("ai_usage_events", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  agent: text("agent").notNull(), // e.g. "offering-agent", "gtm-agent"
  provider: text("provider").notNull(), // "anthropic" | "openai"
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"),
  createdAt: createdAt(),
});

// --- relations (for query API ergonomics) ---

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  score: one(accountScores, {
    fields: [accounts.id],
    references: [accountScores.accountId],
  }),
  signals: many(accountSignals),
  contacts: many(contacts),
  outreach: many(outreachRecommendations),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  accounts: many(accounts),
}));
