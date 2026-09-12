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

  const content = await buildReportContent(campaignId);
  if (!content) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [report] = await db.insert(reports).values({ campaignId, content }).returning();

  return NextResponse.redirect(new URL(`/reports/${report.id}`, req.url));
}
