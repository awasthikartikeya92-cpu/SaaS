// Db client (Postgres). Phase 1 ran this on SQLite (better-sqlite3) for
// local/demo purposes -- see schema.ts's header for why, and git history
// for that version. Now that a real Postgres instance is provisioned
// (Vercel's Prisma Postgres storage add-on), this is the live client for
// both local dev and production.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// STORAGE_POSTGRES_URL is the pooled (PgBouncer) connection string from
// Vercel's Prisma Postgres storage integration -- right for a serverless
// app's runtime queries, since each function instance opens its own
// connection and a direct Postgres connection limit is easy to exhaust
// without a pooler in front. Plain DATABASE_URL is kept as a fallback for
// any other Postgres host (Supabase, a self-hosted instance, etc.) that
// doesn't use Vercel's naming.
const connectionString = process.env.STORAGE_POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "No Postgres connection string set -- expected STORAGE_POSTGRES_URL (Vercel Prisma Postgres) or DATABASE_URL."
  );
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export type DB = typeof db;
