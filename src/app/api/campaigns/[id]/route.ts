import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOwnedCampaign } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

// Deleting a campaign was previously impossible -- there was no DELETE path
// anywhere in the app, on any resource. That meant a wasted free-tier slot
// (a typo'd test campaign, one that failed and can't be retried) was
// permanent, since quota counts campaigns and nothing could remove one from
// the count. See docs/launch-checklist.md.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Same ownership pattern as every other route touching a campaign by id
  // -- see getOwnedCampaign's comment in db/queries.ts. 404, not 403: this
  // shouldn't confirm to a stranger that the id exists.
  const owned = await getOwnedCampaign(id, session.user!.organizationId as string);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Every generation artifact this campaign produced -- offering DNA, ICP,
  // signal taxonomy, accounts and everything under them (scores, signals,
  // contacts, outreach), research runs/sources, reports -- cascades from
  // this single delete via the FK constraints in schema.ts. The one
  // deliberate exception is ai_usage_events (billing/audit history), which
  // is not foreign-keyed to campaigns at all and survives this delete on
  // purpose -- see that table's comment in schema.ts for why.
  await db.delete(campaigns).where(eq(campaigns.id, id));

  await track("campaign_deleted", { campaignId: id, organizationId: owned.organizationId });

  return NextResponse.json({ ok: true });
}
