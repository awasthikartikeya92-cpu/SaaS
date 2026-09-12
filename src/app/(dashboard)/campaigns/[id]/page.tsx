import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignDetail } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OpportunityScore } from "@/components/dashboard/score-bar";
import { TierBadge } from "@/components/dashboard/tier-badge";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCampaignDetail(id);
  if (!data) notFound();

  const { campaign, offeringDna, personas, icp, signals, accounts } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-[var(--font-display)] text-2xl">{campaign.name}</h1>
          <Badge variant={campaign.status === "active" ? "positive" : campaign.status === "generating" ? "accent" : "neutral"}>
            {campaign.status}
          </Badge>
        </div>
        {campaign.website && <p className="text-sm text-ink-soft">{campaign.website}</p>}
      </div>

      {campaign.status === "generating" && (
        <Card><CardContent className="pt-5 text-sm text-ink-soft">
          Running the agent pipeline -- Offering, ICP, Signal Taxonomy, Research, Scoring. Refresh in a moment.
        </CardContent></Card>
      )}

      {campaign.status === "draft" && (
        <Card><CardContent className="pt-5 text-sm text-ink-soft">
          This campaign hasn&apos;t been generated yet.
        </CardContent></Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
          <TabsTrigger value="offering">Offering DNA</TabsTrigger>
          <TabsTrigger value="icp">ICP</TabsTrigger>
          <TabsTrigger value="taxonomy">Signal taxonomy ({signals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          {accounts.length === 0 ? (
            <p className="text-sm text-ink-soft">No accounts discovered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">ICP fit</TableHead>
                  <TableHead className="text-right">Intent</TableHead>
                  <TableHead className="text-right">Opportunity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/accounts/${a.id}`} className="font-medium hover:text-accent">{a.companyName}</Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">{a.industry ?? "--"}</TableCell>
                    <TableCell className="text-right font-[var(--font-data)]">{a.score?.icpFit.toFixed(0) ?? "--"}</TableCell>
                    <TableCell className="text-right font-[var(--font-data)]">{a.score?.intent.toFixed(0) ?? "--"}</TableCell>
                    <TableCell className="text-right"><OpportunityScore value={a.score?.opportunity ?? 0} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="offering">
          {!offeringDna ? (
            <p className="text-sm text-ink-soft">Not generated yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <InfoCard title="Core problem"><p className="text-sm">{offeringDna.coreProblem}</p></InfoCard>
              <InfoCard title="Capabilities"><List items={offeringDna.capabilities} /></InfoCard>
              <InfoCard title="Differentiators"><List items={offeringDna.differentiators} /></InfoCard>
              <InfoCard title="Pain points addressed"><List items={offeringDna.painPoints} /></InfoCard>
              <InfoCard title="Buying triggers"><List items={offeringDna.buyingTriggers} /></InfoCard>
              <InfoCard title="Common objections"><List items={offeringDna.objections} /></InfoCard>
              <InfoCard title="Competitive alternatives"><List items={offeringDna.alternatives} /></InfoCard>
              <InfoCard title="Buyer personas">
                <div className="flex flex-col gap-3">
                  {personas.map((p) => (
                    <div key={p.id}>
                      <p className="text-sm font-medium">{p.title}</p>
                      <List items={p.priorities} />
                    </div>
                  ))}
                </div>
              </InfoCard>
            </div>
          )}
        </TabsContent>

        <TabsContent value="icp">
          {!icp ? (
            <p className="text-sm text-ink-soft">Not generated yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <InfoCard title="Industries"><TagList items={icp.industries} /></InfoCard>
              <InfoCard title="Geographies"><TagList items={icp.geographies} /></InfoCard>
              <InfoCard title="Employee range">
                <p className="text-sm">{icp.employeeMin ?? "?"} - {icp.employeeMax ?? "?"}</p>
              </InfoCard>
              <InfoCard title="Business model"><p className="text-sm">{icp.businessModel ?? "--"}</p></InfoCard>
              <InfoCard title="Technology characteristics"><List items={icp.techCharacteristics} /></InfoCard>
              <InfoCard title="Organizational characteristics"><List items={icp.orgCharacteristics} /></InfoCard>
              <InfoCard title="Buying committee"><List items={icp.buyingCommittee} /></InfoCard>
            </div>
          )}
        </TabsContent>

        <TabsContent value="taxonomy">
          {signals.length === 0 ? (
            <p className="text-sm text-ink-soft">Not generated yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {signals.map((s) => (
                <Card key={s.id}>
                  <CardContent className="flex items-start justify-between gap-4 pt-5">
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{s.description}</p>
                    </div>
                    <TierBadge tier={s.tier} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-ink">{item}</li>
      ))}
    </ul>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => <Badge key={i} variant="neutral">{item}</Badge>)}
    </div>
  );
}
