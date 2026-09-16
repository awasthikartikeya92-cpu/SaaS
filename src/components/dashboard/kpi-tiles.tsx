import { Building2, ShieldCheck, TrendingUp, Flag } from "lucide-react";
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
        <Kpi label="Accounts analyzed" value={kpis.accountsAnalyzed} icon={Building2} />
        <Kpi label="Verified accounts" value={kpis.accountsWithVerifiedSignal} icon={ShieldCheck} />
        <Kpi label="Active-intent accounts" value={kpis.activeIntentAccounts} icon={TrendingUp} />
        <Kpi label="High-priority accounts" value={kpis.highPriorityAccounts} icon={Flag} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <TierTile label="Hot" value={kpis.hot} colorClass="bg-tier-1" textClass="text-tier-1" />
        <TierTile label="Warm" value={kpis.warm} colorClass="bg-tier-2" textClass="text-tier-2" />
        <TierTile label="Emerging" value={kpis.emerging} colorClass="bg-tier-3" textClass="text-tier-3" />
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start justify-between gap-2 pt-5">
        <div>
          <p className="text-xs text-ink-soft">{label}</p>
          <p className="font-[var(--font-data)] text-3xl">{value}</p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function TierTile({
  label,
  value,
  colorClass,
  textClass,
}: {
  label: string;
  value: number;
  colorClass: string;
  textClass: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex items-center gap-3 pt-5">
        <span className={`size-2.5 shrink-0 rounded-full ${colorClass}`} />
        <div>
          <p className="text-xs text-ink-soft">{label}</p>
          <p className={`font-[var(--font-data)] text-xl ${textClass}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
