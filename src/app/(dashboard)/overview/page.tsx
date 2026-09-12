import Link from "next/link";
import { auth } from "@/auth";
import { getDashboardData } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OpportunityScore } from "@/components/dashboard/score-bar";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function OverviewPage() {
  const session = await auth();
  const data = await getDashboardData(session!.user!.organizationId as string);

  if (data.campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong py-24 text-center">
        <p className="font-[var(--font-display)] text-xl">No campaigns yet</p>
        <p className="max-w-sm text-sm text-ink-soft">
          Create a campaign to describe an offering -- SignalIQ builds the ICP, signal taxonomy, and
          account universe from there.
        </p>
        <Button asChild variant="accent" className="mt-2">
          <Link href="/campaigns/new">Create a campaign</Link>
        </Button>
      </div>
    );
  }

  const kpis = data.kpis;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Overview</h1>
        <p className="text-sm text-ink-soft">Across {data.campaigns.length} campaign{data.campaigns.length === 1 ? "" : "s"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Accounts analyzed" value={kpis.accountsAnalyzed} />
        <Kpi label="ICP matches" value={kpis.icpMatches} />
        <Kpi label="Active-intent accounts" value={kpis.activeIntentAccounts} />
        <Kpi label="High-priority accounts" value={kpis.highPriorityAccounts} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Hot</p><p className="font-[var(--font-data)] text-xl text-tier-1">{kpis.hot}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Warm</p><p className="font-[var(--font-data)] text-xl text-tier-2">{kpis.warm}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Emerging</p><p className="font-[var(--font-data)] text-xl text-tier-3">{kpis.emerging}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Top accounts</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Opportunity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topAccounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/accounts/${a.id}`} className="font-medium text-ink hover:text-accent">
                        {a.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">{a.industry ?? "--"}</TableCell>
                    <TableCell className="text-right"><OpportunityScore value={a.score?.opportunity ?? 0} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Latest intent signals</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.latestSignals.length === 0 && <p className="text-sm text-ink-soft">No signals yet.</p>}
            {data.latestSignals.map((s) => (
              <div key={s.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/accounts/${s.accountId}`} className="text-sm font-medium hover:text-accent">
                    {s.account?.companyName ?? "Unknown"}
                  </Link>
                  <span className="text-xs text-ink-soft">{relativeTime(s.detectedAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{s.signalName}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="font-[var(--font-data)] text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}
