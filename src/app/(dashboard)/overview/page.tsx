import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { getCampaignSummaries } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/dashboard/campaign-card";
import { PageHeader } from "@/components/dashboard/page-header";

/**
 * Previously this blended KPIs, top accounts, and a signal feed across
 * every campaign in the org into one dashboard -- which read as meaningful
 * comparison ("12 hot accounts") when the accounts behind that number
 * belonged to entirely different offerings and ICPs, each with its own
 * scoring context. A campaign is the actual unit of analysis in this
 * product (one offering, one ICP, one account universe) -- so this is now
 * a picker: each campaign's own summary, on its own card, linking into
 * that campaign's own dashboard (/campaigns/[id]), which carries the KPI
 * tiles and analytics this page used to show once, blended. See
 * src/lib/db/queries.ts's computeAccountKpis for the fuller reasoning.
 */
export default async function OverviewPage() {
  const session = await auth();
  const summaries = await getCampaignSummaries(session!.user!.organizationId as string);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-paper-raised/40 py-24 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles className="size-5" />
        </div>
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={`${summaries.length} campaign${summaries.length === 1 ? "" : "s"} -- select one to see its own dashboard`}
        actions={
          <Button asChild variant="accent">
            <Link href="/campaigns/new">New campaign</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map(({ campaign, kpis }) => (
          <CampaignCard key={campaign.id} campaign={campaign} kpis={kpis} />
        ))}
      </div>
    </div>
  );
}
