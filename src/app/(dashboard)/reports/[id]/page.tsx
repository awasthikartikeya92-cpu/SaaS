import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { reports, campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReportContent } from "@/lib/agents/report-agent";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) notFound();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, report.campaignId)).limit(1);
  const content = report.content as ReportContent;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl">{campaign?.name} -- report</h1>
          <p className="text-sm text-ink-soft">1. Executive summary through 11. Methodology</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled title="Phase 3">Export PDF</Button>
          <Button variant="outline" size="sm" disabled title="Phase 3">Export DOCX</Button>
          <Button variant="outline" size="sm" disabled title="Phase 3">Export CSV</Button>
        </div>
      </div>
      <p className="text-xs text-ink-soft">Export is a Phase 3 deliverable -- buttons are wired but inactive in Phase 1.</p>

      <Card>
        <CardHeader><CardTitle>1. Executive summary</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{content.executiveSummary}</p></CardContent>
      </Card>

      {content.offeringUnderstanding && (
        <Card>
          <CardHeader><CardTitle>2. Offering understanding</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>{content.offeringUnderstanding.coreProblem}</p>
            <div className="flex flex-wrap gap-1.5">
              {content.offeringUnderstanding.differentiators.map((d, i) => <Badge key={i} variant="neutral">{d}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {content.icp && (
        <Card>
          <CardHeader><CardTitle>3. ICP</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>Industries: {content.icp.industries.join(", ")}</p>
            <p>Geographies: {content.icp.geographies.join(", ")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>4. Signal taxonomy</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          {content.signalTaxonomy.map((s, i) => (
            <p key={i}>Tier {s.tier} -- {s.name}: {s.description}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>5-6. Account universe & priority accounts</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>{content.accountUniverseSize} accounts analyzed. {content.priorityAccounts.length} at high priority:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {content.priorityAccounts.map((a, i) => (
              <li key={i}>{a.companyName} -- opportunity {a.opportunity.toFixed(0)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>8. Decision makers / personas</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {content.decisionMakersOrPersonas.map((p, i) => <Badge key={i} variant="neutral">{p}</Badge>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>11. Methodology</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-ink-soft">{content.methodology}</p></CardContent>
      </Card>
    </div>
  );
}
