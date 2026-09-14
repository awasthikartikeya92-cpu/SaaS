import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// This used to return { ok: true } unconditionally, without touching
// anything -- meaning it could not detect the single most likely real
// outage (the database being unreachable, out of connections, or simply
// misconfigured) and would report healthy the entire time the app was
// actually down for every real user. A trivial round-trip query is enough
// to prove the connection this app actually depends on is live; it isn't
// meant to be a deep readiness probe (that would mean asserting something
// about schema/migration state, a different and heavier check).
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, database: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, database: "unreachable", error: String(err), timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
