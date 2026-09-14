import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getAccountDetail } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar, OpportunityScore } from "@/components/dashboard/score-bar";
import { TierBadge, ConfidenceBadge } from "@/components/dashboard/tier-badge";
import { OutreachChannels } from "@/components/dashboard/outreach-channels";
import { formatDate } from "@/lib/utils";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  // Scoped to this org transitively, through the account's parent campaign
  // -- see getAccountDetail's comment in db/queries.ts.
  const data = await getAccountDetail(id, session!.user!.organizationId as string);
  if (!data) notFound();

  const { account, campaign, score, signals, contacts, outreach } = data;
  const topSignal = [...signals].sort((a, b) => b.strength - a.strength)[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-ink-soft">
            <Link href={`/campaigns/${campaign?.id}`} className="hover:text-accent">{campaign?.name}</Link>
          </p>
          <h1 className="font-[var(--font-display)] text-2xl">{account.companyName}</h1>
          <p className="text-sm text-ink-soft">{account.industry ?? "Industry unknown"} {account.geography ? `- ${account.geography}` : ""}</p>
        </div>
        {score && (
          <div className="text-right">
            <p className="text-xs text-ink-soft">Opportunity score</p>
            <OpportunityScore value={score.opportunity} />
          </div>
        )}
      </div>

      {score && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5">
            <ScoreBar label="ICP fit" value={score.icpFit} />
            <ScoreBar label="Intent" value={score.intent} />
            <ScoreBar label="Reachability" value={score.reachability} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Why this account</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-ink">
              {signals.length} public signal{signals.length === 1 ? "" : "s"} observed, matching{" "}
              {new Set(signals.map((s) => s.signalName)).size} distinct entries in this campaign&apos;s signal
              taxonomy. Strongest signal: <span className="font-medium">{topSignal?.signalName ?? "none"}</span>.
              This is an opportunity hypothesis inferred from public information, not a confirmed buying
              intent.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Why now</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-ink">
              {topSignal
                ? `Most recent signal detected ${formatDate(topSignal.detectedAt)}${topSignal.publishedAt ? `, published ${formatDate(topSignal.publishedAt)}` : ""}.`
                : "No timing signal available yet."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Observed signals & evidence</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {signals.length === 0 && <p className="text-sm text-ink-soft">No signals recorded.</p>}
          {signals.map((s) => (
            <div key={s.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <TierBadge tier={s.tier} />
                <ConfidenceBadge confidence={s.confidence} verified={s.verified} />
                <span className="text-xs text-ink-soft">detected {formatDate(s.detectedAt)}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium">{s.signalName}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{s.evidence}</p>
              {s.source && (
                <a href={s.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
                  {s.source.url}
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recommended persona / decision makers</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {contacts.length === 0 && <p className="text-sm text-ink-soft">No contact recommendation yet.</p>}
          {contacts.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{c.name ?? c.title}</p>
                {c.isVerified ? <Badge variant="positive">Verified</Badge> : <Badge variant="neutral">Recommended title</Badge>}
              </div>
              {c.name && <p className="text-xs text-ink-soft">{c.title}</p>}
              <p className="mt-1 text-sm text-ink-soft">{c.relevance}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recommended outreach</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!outreach ? (
            <p className="text-sm text-ink-soft">Not generated yet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink">{outreach.angle}</p>
                <ul className="flex flex-col gap-1">
                  {outreach.talkingPoints.map((t, i) => (
                    <li key={i} className="text-sm text-ink-soft">- {t}</li>
                  ))}
                </ul>
              </div>
              <OutreachChannels
                draftEmail={outreach.draftEmail}
                draftLinkedIn={outreach.draftLinkedIn}
                callOpener={outreach.callOpener}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
