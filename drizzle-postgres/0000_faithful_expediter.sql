CREATE TABLE "account_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"icp_fit" double precision NOT NULL,
	"intent" double precision NOT NULL,
	"reachability" double precision NOT NULL,
	"opportunity" double precision NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "account_scores_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "account_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"signal_name" text NOT NULL,
	"tier" integer NOT NULL,
	"strength" double precision NOT NULL,
	"confidence" double precision NOT NULL,
	"detected_at" timestamp NOT NULL,
	"published_at" timestamp,
	"verified" boolean DEFAULT false NOT NULL,
	"evidence" text NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"company_name" text NOT NULL,
	"website" text,
	"industry" text,
	"employee_count" integer,
	"geography" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"agent" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_usd" double precision,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_personas" (
	"id" text PRIMARY KEY NOT NULL,
	"offering_dna_id" text NOT NULL,
	"title" text NOT NULL,
	"pain_points" jsonb NOT NULL,
	"priorities" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"problems_solved" text NOT NULL,
	"outcomes" text NOT NULL,
	"differentiators" text NOT NULL,
	"target_industries" jsonb NOT NULL,
	"target_geographies" jsonb NOT NULL,
	"target_company_size" text,
	"known_icp" text,
	"known_personas" text,
	"competitors" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text,
	"title" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"confidence" double precision NOT NULL,
	"relevance" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"format" text NOT NULL,
	"file_url" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icp_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"industries" jsonb NOT NULL,
	"geographies" jsonb NOT NULL,
	"employee_min" integer,
	"employee_max" integer,
	"revenue_min" integer,
	"revenue_max" integer,
	"business_model" text,
	"tech_characteristics" jsonb NOT NULL,
	"org_characteristics" jsonb NOT NULL,
	"buying_committee" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "icp_profiles_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "offering_dna" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"core_problem" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"differentiators" jsonb NOT NULL,
	"pain_points" jsonb NOT NULL,
	"buying_triggers" jsonb NOT NULL,
	"objections" jsonb NOT NULL,
	"alternatives" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "offering_dna_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"current_period_end" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"angle" text NOT NULL,
	"talking_points" jsonb NOT NULL,
	"draft_email" text,
	"draft_linked_in" text,
	"call_opener" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"agent" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"research_run_id" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp NOT NULL,
	"excerpt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"taxonomy_id" text NOT NULL,
	"name" text NOT NULL,
	"tier" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_taxonomies" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "signal_taxonomies_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"metric" text NOT NULL,
	"amount" integer NOT NULL,
	"period_start" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
