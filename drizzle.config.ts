import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` against this config doesn't need a live connection
// string (it only reads the schema to produce migration SQL); `drizzle-kit
// push` does, and will fail loudly if it isn't a real Postgres instance.
//
// STORAGE_DATABASE_URL (Vercel Prisma Postgres's *direct*, non-pooled
// connection) is used here rather than STORAGE_POSTGRES_URL (the pooled one
// src/lib/db/index.ts uses at runtime) -- DDL/schema commands like this one
// don't play well with a transaction-mode pooler. Plain DATABASE_URL is
// kept as a fallback for any other Postgres host.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.STORAGE_DATABASE_URL || process.env.DATABASE_URL || "",
  },
});
