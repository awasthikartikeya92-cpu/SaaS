import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns, reports } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function ReportsPage() {
  const session = await auth();
  const orgCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, session!.user!.organizationId as string));

  const campaignIds = orgCampaigns.map((c) => c.id);
  const allReports = campaignIds.length
    ? await db.select().from(reports).where(inArray(reports.campaignId, campaignIds)).orderBy(desc(reports.createdAt))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Reports</h1>
        <p className="text-sm text-ink-soft">Generate a campaign report, then export it.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Generate a new report</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {orgCampaigns.filter((c) => c.status === "active").length === 0 && (
            <p className="text-sm text-ink-soft">No active campaigns yet -- generate a campaign first.</p>
          )}
          {orgCampaigns
            .filter((c) => c.status === "active")
            .map((c) => (
              <form key={c.id} action="/api/reports" method="POST" className="flex items-center justify-between">
                <input type="hidden" name="campaignId" value={c.id} />
                <span className="text-sm">{c.name}</span>
                <Button type="submit" variant="outline" size="sm">Generate report</Button>
              </form>
            ))}
        </CardContent>
      </Card>

      {allReports.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Existing reports</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {allReports.map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center justify-between rounded-[var(--radius-sm)] px-2 py-2 text-sm hover:bg-paper">
                <span>{orgCampaigns.find((c) => c.id === r.campaignId)?.name ?? r.campaignId}</span>
                <span className="text-ink-soft">{formatDate(r.createdAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
