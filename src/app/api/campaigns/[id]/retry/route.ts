import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOwnedCampaign } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";

// Previously, a "failed" campaign was a dead end -- runNextStep()'s own
// top-of-function guard treats "active"/"failed" as terminal and no-ops, and
// nothing in the UI ever called it again for a failed campaign anyway (the
// old "Refresh" button just did router.refresh(), a page reload -- it never
// posted to /step at all). The only way forward was creating a brand new
// campaign, discarding whatever had already completed. That's a real gap:
// the resumable state machine (see orchestrator.ts's module comment) already
// tracks exactly which of offering/ICP/signal/research succeeded and which
// account is next -- a failed campaign has all the state needed to resume,
// it just had no way back into "generating".
//
// This route is that way back: flip status to "generating" and let the
// existing machinery take it from there. decideStageAction (stage-decision.ts)
// already treats a stage whose last run status is "error" as "not-started",
// so whichever stage actually failed re-runs automatically on the next
// /step call; every stage that already succeeded is skipped, not repeated.
// Each shared stage's persistence also now runs inside a DB transaction
// (see stepOffering/stepSignal/stepResearchAndSeedAccounts in
// orchestrator.ts) specifically so this is safe to call after ANY failure --
// a stage that failed partway through its writes rolled all of them back,
// so retrying it never hits a leftover unique-constraint conflict or
// silently creates duplicate accounts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Same ownership pattern as every other route touching a campaign by id --
  // see getOwnedCampaign's comment in db/queries.ts. 404, not 403: this
  // shouldn't confirm to a stranger that the id exists.
  const owned = await getOwnedCampaign(id, session.user!.organizationId as string);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (owned.status !== "failed") {
    return NextResponse.json({ error: "Only a failed campaign can be retried." }, { status: 400 });
  }

  await db.update(campaigns).set({ status: "generating" }).where(eq(campaigns.id, id));

  await track("campaign_retried", { campaignId: id, organizationId: owned.organizationId });

  return NextResponse.json({ ok: true });
}
