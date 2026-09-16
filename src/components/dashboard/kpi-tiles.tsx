import { Card, CardContent } from "@/components/ui/card";
import type { AccountKpis } from "@/lib/db/queries";

/**
 * The KPI tile grid + Hot/Warm/Emerging breakdown, extracted from the old
 * org-wide /overview page so the exact same presentation now applies once
 * per campaign (on that campaign's own dashboard) instead of once, blended,
 * across every campaign in the org. Takes a single campaign's own
 * AccountKpis -- see src/lib/db/queries.ts's computeAccountKpis for why
 * blending this across campaigns was the actual problem, not just how it
 * was laid out.
 */
export function KpiTiles({ kpis }: { kpis: AccountKpis }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Accounts analyzed" value={kpis.accountsAnalyzed} />
        <Kpi label="Verified accounts" value={kpis.accountsWithVerifiedSignal} />
        <Kpi label="Active-intent accounts" value={kpis.activeIntentAccounts} />
        <Kpi label="High-priority accounts" value={kpis.highPriorityAccounts} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Hot</p><p className="font-[var(--font-data)] text-xl text-tier-1">{kpis.hot}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Warm</p><p className="font-[var(--font-data)] text-xl text-tier-2">{kpis.warm}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-ink-soft">Emerging</p><p className="font-[var(--font-data)] text-xl text-tier-3">{kpis.emerging}</p></CardContent></Card>
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
