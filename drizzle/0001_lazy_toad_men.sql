CREATE TABLE "signup_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"created_at" timestamp NOT NULL
);
