import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { buildReportContent } from "@/lib/agents/report-agent";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const campaignId = form.get("campaignId") as string | null;
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  // buildReportContent only returns data for a campaign owned by this org
  // (see getOwnedCampaign in src/lib/db/queries.ts) -- campaignId came from
  // a form field the caller controls, so without this a signed-in user
  // could generate (and read back) a report for any other org's campaign
  // just by knowing its id.
  const organizationId = session.user!.organizationId as string;
  const content = await buildReportContent(campaignId, organizationId);
  if (!content) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [report] = await db.insert(reports).values({ campaignId, content }).returning();

  return NextResponse.redirect(new URL(`/reports/${report.id}`, req.url));
}
