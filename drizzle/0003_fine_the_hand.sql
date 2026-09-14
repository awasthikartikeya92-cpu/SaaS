ALTER TABLE "account_scores" ADD CONSTRAINT "account_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_signals" ADD CONSTRAINT "account_signals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_signals" ADD CONSTRAINT "account_signals_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_personas" ADD CONSTRAINT "buyer_personas_offering_dna_id_offering_dna_id_fk" FOREIGN KEY ("offering_dna_id") REFERENCES "public"."offering_dna"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_sources" ADD CONSTRAINT "contact_sources_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icp_profiles" ADD CONSTRAINT "icp_profiles_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_dna" ADD CONSTRAINT "offering_dna_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_recommendations" ADD CONSTRAINT "outreach_recommendations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_definitions" ADD CONSTRAINT "signal_definitions_taxonomy_id_signal_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."signal_taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_taxonomies" ADD CONSTRAINT "signal_taxonomies_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_signals_account_id_idx" ON "account_signals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_signals_source_id_idx" ON "account_signals" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "accounts_campaign_id_idx" ON "accounts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "accounts_campaign_id_status_idx" ON "accounts" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "ai_usage_events_organization_id_created_at_idx" ON "ai_usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_campaign_id_idx" ON "ai_usage_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "buyer_personas_offering_dna_id_idx" ON "buyer_personas" USING btree ("offering_dna_id");--> statement-breakpoint
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contact_sources_contact_id_idx" ON "contact_sources" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_account_id_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "credentials_organization_id_idx" ON "credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "exports_report_id_idx" ON "exports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "outreach_recommendations_account_id_idx" ON "outreach_recommendations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "reports_campaign_id_idx" ON "reports" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "research_runs_campaign_id_agent_idx" ON "research_runs" USING btree ("campaign_id","agent");--> statement-breakpoint
CREATE INDEX "research_sources_research_run_id_idx" ON "research_sources" USING btree ("research_run_id");--> statement-breakpoint
CREATE INDEX "signal_definitions_taxonomy_id_idx" ON "signal_definitions" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "signup_attempts_ip_address_created_at_idx" ON "signup_attempts" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "usage_organization_id_idx" ON "usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" USING btree ("organization_id");