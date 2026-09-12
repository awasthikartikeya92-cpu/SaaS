ALTER TABLE "accounts" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "failure_reason" text;