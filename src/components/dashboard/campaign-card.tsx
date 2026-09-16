import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { campaigns } from "@/lib/db/schema";
import type { AccountKpis } from "@/lib/db/queries";

/**
 * One campaign's own summary, as a clickable card -- the /overview picker's
 * whole reason for existing. Deliberately shows only stats that are honest
 * within a single campaign's own context (accounts analyzed, its own
 * Hot/Warm/Emerging breakdown) -- exactly what stopped being trustworthy
 * once blended across campaigns with different offerings and ICPs. See
 * queries.ts's computeAccountKpis for the fuller reasoning.
 */
export function CampaignCard({ campaign, kpis }: { campaign: typeof campaigns.$inferSelect; kpis: AccountKpis }) {
  const stillGenerating = campaign.status === "draft" || campaign.status === "generating";

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <Card className="h-full transition-colors hover:border-line-strong">
        <CardContent className="flex h-full flex-col gap-4 pt-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{campaign.name}</p>
              {campaign.website && <p className="truncate text-xs text-ink-soft">{campaign.website}</p>}
            </div>
            <Badge
              variant={
                campaign.status === "active" ? "positive" : campaign.status === "failed" ? "negative" : stillGenerating ? "accent" : "neutral"
              }
            >
              {stillGenerating ? "generating" : campaign.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-ink-soft">Accounts</p>
              <p className="font-[var(--font-data)] text-lg">{kpis.accountsAnalyzed}</p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">High priority</p>
              <p className="font-[var(--font-data)] text-lg">{kpis.highPriorityAccounts}</p>
            </div>
          </div>

          {kpis.accountsAnalyzed > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tier-1" />{kpis.hot} hot</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tier-2" />{kpis.warm} warm</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tier-3" />{kpis.emerging} emerging</span>
            </div>
          )}

          <p className="mt-auto text-xs text-ink-soft">Created {formatDate(campaign.createdAt)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
