import { defineConfig } from "drizzle-kit";

// Config for the production (Postgres) schema -- see src/lib/db/schema.postgres.ts.
// `drizzle-kit generate` against this config doesn't need a live DATABASE_URL
// (it only reads the schema to produce migration SQL); `drizzle-kit push`
// does, and will fail loudly if DATABASE_URL isn't a real Postgres instance.
export default defineConfig({
  schema: "./src/lib/db/schema.postgres.ts",
  out: "./drizzle-postgres",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
