// SignalIQ schema (Drizzle ORM, Postgres). Phase 1 ran this on SQLite for
// local/demo purposes (network-restricted sandbox at the time couldn't reach
// a real Postgres instance or Prisma's engine binary) -- see git history if
// you need that version. Now that a real Postgres instance is provisioned
// (Vercel's Prisma Postgres storage add-on), this is the live schema for
// both local dev and production; there's no more SQLite fallback.

import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
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

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("users_organization_id_idx").on(table.organizationId)]
);

export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "anthropic" | "openai" | "tavily" | ...
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("credentials_organization_id_idx").on(table.organizationId)]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
    status: text("status").notNull().default("draft"), // draft | generating | active | failed | archived
    createdAt: createdAt(),
  },
  (table) => [index("campaigns_organization_id_idx").on(table.organizationId)]
);

export const offeringDna = pgTable("offering_dna", {
  id: id(),
  campaignId: text("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  coreProblem: text("core_problem").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  differentiators: jsonb("differentiators").$type<string[]>().notNull(),
  painPoints: jsonb("pain_points").$type<string[]>().notNull(),
  buyingTriggers: jsonb("buying_triggers").$type<string[]>().notNull(),
  objections: jsonb("objections").$type<string[]>().notNull(),
  alternatives: jsonb("alternatives").$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const buyerPersonas = pgTable(
  "buyer_personas",
  {
    id: id(),
    offeringDnaId: text("offering_dna_id")
      .notNull()
      .references(() => offeringDna.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    painPoints: jsonb("pain_points").$type<string[]>().notNull(),
    priorities: jsonb("priorities").$type<string[]>().notNull(),
  },
  (table) => [index("buyer_personas_offering_dna_id_idx").on(table.offeringDnaId)]
);

export const icpProfiles = pgTable("icp_profiles", {
  id: id(),
  campaignId: text("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  industries: jsonb("industries").$type<string[]>().notNull(),
  geographies: jsonb("geographies").$type<string[]>().notNull(),
  employeeMin: integer("employee_min"),
  employeeMax: integer("employee_max"),
  // doublePrecision, not integer: revenue is in raw dollars, and the ICP
  // Agent routinely targets large public enterprises (this product's own
  // GTM strategy -- an SMB vendor's ICP is often a company that files a
  // 10-K, see docs/launch-checklist.md's SEC EDGAR section) whose revenue
  // in dollars regularly exceeds Postgres's 32-bit `integer` ceiling
  // (2,147,483,647 -- about $2.1B). A `revenueMax` of, say, $50B for a
  // Fortune 500 ICP overflowed that column and threw "value out of range
  // for type integer" on insert -- see the stepIcp() fix in orchestrator.ts
  // for why that specific failure showed up in the UI as "Generation
  // failed at icp-agent" with no error text at all.
  revenueMin: doublePrecision("revenue_min"),
  revenueMax: doublePrecision("revenue_max"),
  businessModel: text("business_model"),
  techCharacteristics: jsonb("tech_characteristics").$type<string[]>().notNull(),
  orgCharacteristics: jsonb("org_characteristics").$type<string[]>().notNull(),
  buyingCommittee: jsonb("buying_committee").$type<string[]>().notNull(),
  generatedAt: createdAt(),
});

export const signalTaxonomies = pgTable("signal_taxonomies", {
  id: id(),
  campaignId: text("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  generatedAt: createdAt(),
});

export const signalDefinitions = pgTable(
  "signal_definitions",
  {
    id: id(),
    taxonomyId: text("taxonomy_id")
      .notNull()
      .references(() => signalTaxonomies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tier: integer("tier").notNull(), // 1 direct, 2 strong indirect, 3 contextual
    description: text("description").notNull(),
  },
  (table) => [index("signal_definitions_taxonomy_id_idx").on(table.taxonomyId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    website: text("website"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    geography: text("geography"),
    // Per-account leg of the resumable generation pipeline (see
    // src/lib/agents/orchestrator.ts). A row is inserted as "pending" as
    // soon as research/verification identifies the company -- before
    // Contact or GTM have run -- so the account is visible in the UI
    // immediately and fills in as each step completes, instead of the
    // whole campaign staying blank until every account finishes.
    // "contacted" = contact-agent done, waiting on gtm-agent. "done"/
    // "failed" are terminal for this account and are never revisited --
    // one account failing doesn't block or retry the others (see
    // docs/launch-checklist.md).
    status: text("status").notNull().default("pending"), // pending | contacted | done | failed
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    index("accounts_campaign_id_idx").on(table.campaignId),
    // Serves orchestrator.ts's runNextStep(), which queries "the next
    // pending account" / "the next contacted account" for a campaign on
    // every single step call -- the hottest query in the whole pipeline.
    index("accounts_campaign_id_status_idx").on(table.campaignId, table.status),
  ]
);

export const accountScores = pgTable("account_scores", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  icpFit: doublePrecision("icp_fit").notNull(),
  intent: doublePrecision("intent").notNull(),
  reachability: doublePrecision("reachability").notNull(),
  opportunity: doublePrecision("opportunity").notNull(),
  computedAt: createdAt(),
});

export const researchRuns = pgTable(
  "research_runs",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    status: text("status").notNull(), // running | success | error
    input: jsonb("input").$type<unknown>().notNull(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    startedAt: createdAt(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
  },
  (table) => [
    // Serves stageGate()'s "is offering-agent already done/in-flight for
    // this campaign" check -- called on every step call before any of the
    // four shared stages run.
    index("research_runs_campaign_id_agent_idx").on(table.campaignId, table.agent),
  ]
);

export const researchSources = pgTable(
  "research_sources",
  {
    id: id(),
    researchRunId: text("research_run_id")
      .notNull()
      .references(() => researchRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }),
    retrievedAt: createdAt(),
    excerpt: text("excerpt").notNull(),
  },
  (table) => [index("research_sources_research_run_id_idx").on(table.researchRunId)]
);

export const accountSignals = pgTable(
  "account_signals",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    signalName: text("signal_name").notNull(),
    tier: integer("tier").notNull(),
    strength: doublePrecision("strength").notNull(), // 0-100
    confidence: doublePrecision("confidence").notNull(), // 0-1
    detectedAt: timestamp("detected_at", { mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }),
    verified: boolean("verified").notNull().default(false),
    evidence: text("evidence").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("account_signals_account_id_idx").on(table.accountId),
    index("account_signals_source_id_idx").on(table.sourceId),
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name"), // null when this is a recommended title, not a verified person
    title: text("title").notNull(),
    isVerified: boolean("is_verified").notNull().default(false),
    confidence: doublePrecision("confidence").notNull(),
    relevance: text("relevance").notNull(),
  },
  (table) => [index("contacts_account_id_idx").on(table.accountId)]
);

export const contactSources = pgTable(
  "contact_sources",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    detectedAt: createdAt(),
  },
  (table) => [index("contact_sources_contact_id_idx").on(table.contactId)]
);

export const outreachRecommendations = pgTable(
  "outreach_recommendations",
  {
    id: id(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    angle: text("angle").notNull(),
    talkingPoints: jsonb("talking_points").$type<string[]>().notNull(),
    draftEmail: text("draft_email"),
    draftLinkedIn: text("draft_linked_in"),
    callOpener: text("call_opener"),
    generatedAt: createdAt(),
  },
  (table) => [index("outreach_recommendations_account_id_idx").on(table.accountId)]
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("reports_campaign_id_idx").on(table.campaignId)]
);

export const exportsTable = pgTable(
  "exports",
  {
    id: id(),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // pdf | docx | csv
    fileUrl: text("file_url").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("exports_report_id_idx").on(table.reportId)]
);

export const usage = pgTable(
  "usage",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    amount: integer("amount").notNull(),
    periodStart: timestamp("period_start", { mode: "date" }).notNull(),
  },
  (table) => [index("usage_organization_id_idx").on(table.organizationId)]
);

// Crude, IP-based signup throttle (src/lib/auth/rate-limit.ts). This is a
// deterrent, not a real defense -- an attacker who rotates IPs still gets
// through -- but it raises the bar above "one HTTP request per free org"
// against the per-organization campaign quota, without requiring an email
// provider or CAPTCHA service. Real abuse prevention (email verification,
// CAPTCHA) is a documented follow-up in docs/launch-checklist.md.
export const signupAttempts = pgTable(
  "signup_attempts",
  {
    id: id(),
    ipAddress: text("ip_address").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // Serves checkAndRecordSignupAttempt()'s "how many attempts from this
    // ip in the last hour" count -- run on every signup POST.
    index("signup_attempts_ip_address_created_at_idx").on(table.ipAddress, table.createdAt),
  ]
);

// Same crude, IP-based throttle as signupAttempts above, applied to
// forgot-password requests specifically (src/lib/auth/rate-limit.ts) -- a
// separate table rather than a shared/generic one so this limit can never
// accidentally interact with the signup limit's count, and so each stays
// simple to reason about on its own. A forgot-password endpoint is a
// natural target for both volumetric abuse (mass-triggering reset emails)
// and user-enumeration probing, on top of the reasons signup needs one.
export const passwordResetAttempts = pgTable(
  "password_reset_attempts",
  {
    id: id(),
    ipAddress: text("ip_address").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("password_reset_attempts_ip_address_created_at_idx").on(table.ipAddress, table.createdAt)]
);

// One row per issued reset link. Only `tokenHash` is ever stored -- never
// the raw token -- so a compromised database doesn't hand over usable reset
// links, the same principle as storing a bcrypt hash instead of a plaintext
// password (though this uses a plain SHA-256 hash, not bcrypt: the input
// here is already a 256-bit random value, not a low-entropy user-chosen
// password, so there's nothing for bcrypt's deliberate slowness to defend
// against -- see src/lib/auth/password-reset.ts). `usedAt` enforces
// single-use; `expiresAt` bounds how long a link stays valid regardless.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    // Serves the reset endpoint's "look up by this token's hash" query --
    // the hottest, and only, lookup this table serves on that path.
    index("password_reset_tokens_token_hash_idx").on(table.tokenHash),
    // Serves invalidateOutstandingTokens()'s "every other token for this
    // user" query, run once a reset actually succeeds.
    index("password_reset_tokens_user_id_idx").on(table.userId),
  ]
);

// Per-LLM-call usage log, written by src/lib/billing/usage-tracking.ts (via
// the AsyncLocalStorage context in src/lib/ai/usage-context.ts) every time an
// AI provider call returns. This is the raw data behind unit-economics
// decisions (cost per campaign, free-tier sizing, plan pricing) -- see
// docs/launch-checklist.md. Token counts come straight from the provider's
// API response, so they're ground truth; `estimatedCostUsd` is only as good
// as the rates in src/lib/billing/pricing-config.ts and is null when a
// model isn't in that table yet.
//
// Deliberately NOT foreign-keyed to campaigns/organizations, unlike every
// other table here: this is a billing/audit trail. A hard FK with the
// default (no action) behavior would block deleting a campaign that ever
// made an AI call -- i.e. every campaign that ever ran -- which would make
// the delete-campaign feature (src/app/api/campaigns/[id]/route.ts)
// unusable the moment it mattered. A cascade would silently erase the
// record that money was spent the moment its campaign is deleted, which is
// worse: the org still paid for those tokens whether or not the campaign
// that caused it still exists. Indexed the same as everywhere else for
// query performance; just not constrained.
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
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
  },
  (table) => [
    // Serves getOrganizationUsageThisPeriod()'s "this org, since the start
    // of the month" query.
    index("ai_usage_events_organization_id_created_at_idx").on(table.organizationId, table.createdAt),
    // Serves getCampaignUsage()'s "every call this campaign made" query.
    index("ai_usage_events_campaign_id_idx").on(table.campaignId),
  ]
);

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
