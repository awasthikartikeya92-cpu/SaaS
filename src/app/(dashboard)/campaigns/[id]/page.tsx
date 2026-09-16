import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getCampaignDetail, getGenerationProgress, getCampaignAnalytics, getCampaignSignals, getCampaignContacts } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OpportunityScore } from "@/components/dashboard/score-bar";
import { TierBadge, ConfidenceBadge } from "@/components/dashboard/tier-badge";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { RetryCampaignButton } from "@/components/dashboard/retry-campaign-button";
import { GenerationProgress } from "@/components/dashboard/generation-progress";
import { DeleteCampaignButton } from "@/components/dashboard/delete-campaign-button";
import { formatDate } from "@/lib/utils";

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  contacted: "Scoring...",
  done: "Done",
  failed: "Failed",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  // All five queries are scoped to this org internally (see getOwnedCampaign
  // in db/queries.ts) -- a campaign belonging to a different org comes back
  // as null from each, indistinguishable here from "doesn't exist," which
  // is exactly what we want: notFound() rather than a 403 that would
  // confirm the id exists.
  const organizationId = session!.user!.organizationId as string;
  const [data, progress, analytics, campaignSignals, campaignContacts] = await Promise.all([
    getCampaignDetail(id, organizationId),
    getGenerationProgress(id, organizationId),
    getCampaignAnalytics(id, organizationId),
    getCampaignSignals(id, organizationId),
    getCampaignContacts(id, organizationId),
  ]);
  if (!data || !progress || !analytics || campaignSignals === null || campaignContacts === null) notFound();

  const { campaign, offeringDna, personas, icp, signals, accounts, latestRun } = data;

  const stillGenerating = campaign.status === "draft" || campaign.status === "generating";

  // The failure card's hint used to always say "usually a missing/invalid
  // ANTHROPIC_API_KEY" no matter what actually failed -- misleading for a
  // real error like a request timeout, which looked identical to a
  // misconfigured key from the UI alone. Match on the actual error text
  // instead so the hint points at what's actually likely wrong.
  const failureHint = /timed? ?out/i.test(latestRun?.error ?? "")
    ? "The AI provider took too long to respond. This can happen on a large or detailed offering description -- create a new campaign and try again; if it keeps happening, it may be worth trimming the offering details."
    : /api[_ ]?key|unauthorized|401|authentication/i.test(latestRun?.error ?? "")
      ? "This is usually a missing or invalid ANTHROPIC_API_KEY."
      : "Check the error above for what went wrong.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-[var(--font-display)] text-2xl">{campaign.name}</h1>
            <Badge
              variant={
                campaign.status === "active"
                  ? "positive"
                  : campaign.status === "failed"
                    ? "negative"
                    : stillGenerating
                      ? "accent"
                      : "neutral"
              }
            >
              {stillGenerating ? "generating" : campaign.status}
            </Badge>
          </div>
          {campaign.website && <p className="text-sm text-ink-soft">{campaign.website}</p>}
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "failed" && <RetryCampaignButton campaignId={id} />}
          <DeleteCampaignButton campaignId={id} campaignName={campaign.name} redirectTo="/campaigns" variant="destructive" />
        </div>
      </div>

      {stillGenerating && <GenerationProgress campaignId={id} initial={progress} />}

      {campaign.status === "active" && progress.failedAccounts.length > 0 && (
        <Card>
          <CardContent className="pt-5 text-sm">
            <p className="font-medium text-ink">
              {progress.failedAccounts.length} of {progress.accountsTotal} account
              {progress.accountsTotal === 1 ? "" : "s"} couldn&apos;t be fully processed.
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Everything else below completed normally -- one account failing doesn&apos;t affect the others.
              Affected: {progress.failedAccounts.map((a) => a.companyName).join(", ")}.
            </p>
          </CardContent>
        </Card>
      )}

      {campaign.status === "failed" && (
        <Card>
          <CardContent className="pt-5 text-sm">
            <p className="font-medium text-negative">Generation failed{latestRun ? ` at ${latestRun.agent}` : ""}.</p>
            {latestRun?.error && (
              <p className="mt-2 whitespace-pre-wrap font-[var(--font-data)] text-xs text-ink-soft">
                {latestRun.error}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-soft">
              {failureHint} Click &quot;Retry generation&quot; above to resume -- everything that already
              completed is kept; only the failed step (and anything after it) runs again.
            </p>
            {(progress.stages.offering === "success" ||
              progress.stages.icp === "success" ||
              progress.stages.signal === "success" ||
              progress.stages.research === "success" ||
              progress.accountsTotal > 0) && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-xs font-medium text-ink-soft">What already completed before this failure:</p>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-soft">
                  <li>Offering DNA: {progress.stages.offering === "success" ? "done" : "not reached"}</li>
                  <li>ICP: {progress.stages.icp === "success" ? "done" : "not reached"}</li>
                  <li>Signal taxonomy: {progress.stages.signal === "success" ? "done" : "not reached"}</li>
                  <li>Research: {progress.stages.research === "success" ? "done" : "not reached"}</li>
                  {progress.accountsTotal > 0 && (
                    <li>
                      Accounts: {progress.accountsDone} of {progress.accountsTotal} processed
                      {progress.failedAccounts.length > 0 &&
                        ` (${progress.failedAccounts.length} failed: ${progress.failedAccounts.map((a) => a.companyName).join(", ")})`}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        {/* overflow-x-auto is a safety net at narrow widths -- seven tabs
            is more than this TabsList has ever held before. */}
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({campaignContacts.length})</TabsTrigger>
            <TabsTrigger value="signals">Signals ({campaignSignals.length})</TabsTrigger>
            <TabsTrigger value="offering">Offering DNA</TabsTrigger>
            <TabsTrigger value="icp">ICP</TabsTrigger>
            <TabsTrigger value="taxonomy">Signal taxonomy ({signals.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          {analytics.kpis.accountsAnalyzed === 0 ? (
            <p className="text-sm text-ink-soft">No accounts discovered yet.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <KpiTiles kpis={analytics.kpis} />
              <Card>
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
                      {analytics.topAccounts.map((a) => (
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
            </div>
          )}
        </TabsContent>

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
                    <TableCell className="text-right">
                      {/* opportunity depends on Contact/GTM, which haven't
                          run yet for a "pending"/"contacted" account -- a
                          real 0 there would look like a scored, low-priority
                          account rather than an unfinished one. */}
                      {a.status === "done" ? (
                        <OpportunityScore value={a.score?.opportunity ?? 0} />
                      ) : (
                        <Badge variant={a.status === "failed" ? "negative" : "accent"}>
                          {ACCOUNT_STATUS_LABEL[a.status] ?? a.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="contacts">
          {campaignContacts.length === 0 ? (
            <p className="text-sm text-ink-soft">No contacts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / title</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Relevance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignContacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.name ?? c.title}</p>
                      {c.name && <p className="text-xs text-ink-soft">{c.title}</p>}
                    </TableCell>
                    <TableCell>
                      <Link href={`/accounts/${c.accountId}`} className="text-ink-soft hover:text-accent">
                        {c.account?.companyName ?? "--"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.isVerified ? <Badge variant="positive">Verified</Badge> : <Badge variant="neutral">Recommended title</Badge>}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-ink-soft">{c.relevance}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="signals">
          {campaignSignals.length === 0 ? (
            <p className="text-sm text-ink-soft">No signals recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {campaignSignals.map((s) => (
                <Card key={s.id}>
                  <CardContent className="flex flex-col gap-2 pt-5">
                    <div className="flex items-center justify-between">
                      <Link href={`/accounts/${s.accountId}`} className="text-sm font-medium hover:text-accent">
                        {s.account?.companyName ?? "Unknown company"}
                      </Link>
                      <span className="text-xs text-ink-soft">{formatDate(s.detectedAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TierBadge tier={s.tier} />
                      <ConfidenceBadge confidence={s.confidence} verified={s.verified} />
                    </div>
                    <p className="text-sm text-ink-soft">{s.evidence}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="offering">
          {!offeringDna ? (
            <p className="text-sm text-ink-soft">Not generated yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
