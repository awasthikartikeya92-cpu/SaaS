// SignalIQ — Phase 1 schema (Drizzle ORM, SQLite for local dev).
//
// NOTE ON DB CHOICE: the architecture doc (§7) specifies Postgres + Prisma.
// This sandbox cannot reach Prisma's engine-binary host or a real Postgres
// instance, so Phase 1 here runs on Drizzle + SQLite — same normalized shape,
// zero setup, fully swappable. Moving to Postgres in production means
// swapping the driver import (drizzle-orm/node-postgres or /postgres-js) and
// running `drizzle-kit generate` against a Postgres schema.ts; table/column
// shape below carries over directly.

import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date());

export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  // Billing/plan fields. `plan` gates campaign creation (see
  // src/lib/billing/quota.ts); the stripe* columns are null until an org has
  // actually gone through Checkout (src/app/api/billing/checkout/route.ts).
  plan: text("plan").notNull().default("free"), // see src/lib/billing/plans.ts for plan ids
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // active | past_due | canceled | ...
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  organizationId: text("organization_id").notNull(),
  createdAt: createdAt(),
});

export const credentials = sqliteTable("credentials", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  provider: text("provider").notNull(), // "anthropic" | "openai" | "tavily" | ...
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: createdAt(),
});

export const campaigns = sqliteTable("campaigns", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  website: text("website"),
  problemsSolved: text("problems_solved").notNull(),
  outcomes: text("outcomes").notNull(),
  differentiators: text("differentiators").notNull(),
  targetIndustries: text("target_industries", { mode: "json" }).$type<string[]>().notNull(),
  targetGeographies: text("target_geographies", { mode: "json" }).$type<string[]>().notNull(),
  targetCompanySize: text("target_company_size"),
  knownIcp: text("known_icp"),
  knownPersonas: text("known_personas"),
  competitors: text("competitors"),
  status: text("status").notNull().default("draft"), // draft | generating | active | archived
  createdAt: createdAt(),
});

export const offeringDna = sqliteTable("offering_dna", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  coreProblem: text("core_problem").notNull(),
  capabilities: text("capabilities", { mode: "json" }).$type<string[]>().notNull(),
  differentiators: text("differentiators", { mode: "json" }).$type<string[]>().notNull(),
  painPoints: text("pain_points", { mode: "json" }).$type<string[]>().notNull(),
  buyingTriggers: text("buying_triggers", { mode: "json" }).$type<string[]>().notNull(),
  objections: text("objections", { mode: "json" }).$type<string[]>().notNull(),
  alternatives: text("alternatives", { mode: "json" }).$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const buyerPersonas = sqliteTable("buyer_personas", {
  id: id(),
  offeringDnaId: text("offering_dna_id").notNull(),
  title: text("title").notNull(),
  painPoints: text("pain_points", { mode: "json" }).$type<string[]>().notNull(),
  priorities: text("priorities", { mode: "json" }).$type<string[]>().notNull(),
});

export const icpProfiles = sqliteTable("icp_profiles", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  industries: text("industries", { mode: "json" }).$type<string[]>().notNull(),
  geographies: text("geographies", { mode: "json" }).$type<string[]>().notNull(),
  employeeMin: integer("employee_min"),
  employeeMax: integer("employee_max"),
  revenueMin: integer("revenue_min"),
  revenueMax: integer("revenue_max"),
  businessModel: text("business_model"),
  techCharacteristics: text("tech_characteristics", { mode: "json" }).$type<string[]>().notNull(),
  orgCharacteristics: text("org_characteristics", { mode: "json" }).$type<string[]>().notNull(),
  buyingCommittee: text("buying_committee", { mode: "json" }).$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const signalTaxonomies = sqliteTable("signal_taxonomies", {
  id: id(),
  campaignId: text("campaign_id").notNull().unique(),
  generatedAt: createdAt(),
});

export const signalDefinitions = sqliteTable("signal_definitions", {
  id: id(),
  taxonomyId: text("taxonomy_id").notNull(),
  name: text("name").notNull(),
  tier: integer("tier").notNull(), // 1 direct, 2 strong indirect, 3 contextual
  description: text("description").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  companyName: text("company_name").notNull(),
  website: text("website"),
  industry: text("industry"),
  employeeCount: integer("employee_count"),
  geography: text("geography"),
  createdAt: createdAt(),
});

export const accountScores = sqliteTable("account_scores", {
  id: id(),
  accountId: text("account_id").notNull().unique(),
  icpFit: real("icp_fit").notNull(),
  intent: real("intent").notNull(),
  reachability: real("reachability").notNull(),
  opportunity: real("opportunity").notNull(),
  computedAt: createdAt(),
});

export const researchRuns = sqliteTable("research_runs", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  agent: text("agent").notNull(),
  status: text("status").notNull(), // running | success | error
  input: text("input", { mode: "json" }).$type<unknown>().notNull(),
  output: text("output", { mode: "json" }).$type<unknown>(),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

export const researchSources = sqliteTable("research_sources", {
  id: id(),
  researchRunId: text("research_run_id").notNull(),
  url: text("url").notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  retrievedAt: createdAt(),
  excerpt: text("excerpt").notNull(),
});

export const accountSignals = sqliteTable("account_signals", {
  id: id(),
  accountId: text("account_id").notNull(),
  signalName: text("signal_name").notNull(),
  tier: integer("tier").notNull(),
  strength: real("strength").notNull(), // 0-100
  confidence: real("confidence").notNull(), // 0-1
  detectedAt: integer("detected_at", { mode: "timestamp" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  evidence: text("evidence").notNull(),
  sourceId: text("source_id").notNull(),
});

export const contacts = sqliteTable("contacts", {
  id: id(),
  accountId: text("account_id").notNull(),
  name: text("name"), // null when this is a recommended title, not a verified person
  title: text("title").notNull(),
  isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
  confidence: real("confidence").notNull(),
  relevance: text("relevance").notNull(),
});

export const contactSources = sqliteTable("contact_sources", {
  id: id(),
  contactId: text("contact_id").notNull(),
  url: text("url").notNull(),
  detectedAt: createdAt(),
});

export const outreachRecommendations = sqliteTable("outreach_recommendations", {
  id: id(),
  accountId: text("account_id").notNull(),
  angle: text("angle").notNull(),
  talkingPoints: text("talking_points", { mode: "json" }).$type<string[]>().notNull(),
  draftEmail: text("draft_email"),
  draftLinkedIn: text("draft_linked_in"),
  callOpener: text("call_opener"),
  generatedAt: createdAt(),
});

export const reports = sqliteTable("reports", {
  id: id(),
  campaignId: text("campaign_id").notNull(),
  content: text("content", { mode: "json" }).$type<unknown>().notNull(),
  createdAt: createdAt(),
});

export const exportsTable = sqliteTable("exports", {
  id: id(),
  reportId: text("report_id").notNull(),
  format: text("format").notNull(), // pdf | docx | csv
  fileUrl: text("file_url").notNull(),
  createdAt: createdAt(),
});

export const usage = sqliteTable("usage", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  metric: text("metric").notNull(),
  amount: integer("amount").notNull(),
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
});

// Per-LLM-call usage log, written by src/lib/billing/usage-tracking.ts (via
// the AsyncLocalStorage context in src/lib/ai/usage-context.ts) every time an
// AI provider call returns. This is the raw data behind unit-economics
// decisions (cost per campaign, free-tier sizing, plan pricing) -- see
// docs/launch-checklist.md. Token counts come straight from the provider's
// API response, so they're ground truth; `estimatedCostUsd` is only as good
// as the rates in src/lib/billing/pricing-config.ts and is null when a
// model isn't in that table yet.
export const aiUsageEvents = sqliteTable("ai_usage_events", {
  id: id(),
  organizationId: text("organization_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  agent: text("agent").notNull(), // e.g. "offering-agent", "gtm-agent"
  provider: text("provider").notNull(), // "anthropic" | "openai"
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  estimatedCostUsd: real("estimated_cost_usd"),
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
