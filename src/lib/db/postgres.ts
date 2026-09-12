// Standalone Postgres client, ready to become the app's db module -- see the
// switch instructions at the top of src/lib/db/schema.postgres.ts. Kept as a
// separate file (rather than a runtime branch inside index.ts) so the
// currently-tested SQLite path can't be affected by this one being wrong;
// activating this is a one-line import change in index.ts, not a rewrite.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set -- required for the Postgres db module.");
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export type DB = typeof db;
