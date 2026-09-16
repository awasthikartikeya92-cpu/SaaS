import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCORING_WEIGHTS } from "@/lib/scoring";
import { auth } from "@/auth";
import { getOrganizationPlan } from "@/lib/billing/quota";
import { getOrganizationUsageThisPeriod } from "@/lib/billing/usage-tracking";
import { PLANS } from "@/lib/billing/plans";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function SettingsPage() {
  const session = await auth();
  const organizationId = session!.user!.organizationId as string;
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];
  const usage = await getOrganizationUsageThisPeriod(organizationId);
  const totalCost = usage.reduce<number | null>(
    (sum, u) => (sum === null || u.estimatedCostUsd === null ? null : sum + u.estimatedCostUsd),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Organization, plan, and scoring configuration." />

      <Card>
        <CardHeader><CardTitle>Plan & usage</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            Current plan: <span className="font-[var(--font-data)] text-ink">{plan.name}</span>
            {plan.priceUsdPerMonth != null && (
              <span className="text-ink-soft"> -- ${plan.priceUsdPerMonth}/month</span>
            )}
          </p>
          {plan.campaignsPerMonth != null && (
            <p className="text-ink-soft">{plan.campaignsPerMonth} campaigns included per calendar month.</p>
          )}
          {usage.length > 0 && (
            <div className="rounded-[var(--radius-sm)] border border-line bg-paper-raised p-3 text-xs text-ink-soft">
              <p className="mb-1 font-medium text-ink">This month&apos;s AI usage</p>
              {usage.map((u) => (
                <p key={u.agent}>
                  {u.agent}: {u.calls} call{u.calls === 1 ? "" : "s"}, {u.inputTokens + u.outputTokens} tokens
                  {u.estimatedCostUsd != null && ` -- $${u.estimatedCostUsd.toFixed(4)}`}
                </p>
              ))}
              {totalCost !== null && <p className="mt-1 font-medium text-ink">Total: ${totalCost.toFixed(4)}</p>}
            </div>
          )}
          {(["starter", "growth"] as const)
            .filter((id) => PLANS[id].id !== planId)
            .map((id) => {
              const target = PLANS[id];
              const priced = target.priceUsdPerMonth != null;
              return (
                <div key={id} className="flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="font-medium text-ink">{target.name}</p>
                    <p className="text-xs text-ink-soft">
                      {priced ? `$${target.priceUsdPerMonth}/month` : "Pricing coming soon"}
                    </p>
                  </div>
                  {priced ? (
                    <UpgradeButton planId={id} label={`Upgrade to ${target.name}`} />
                  ) : null}
                </div>
              );
            })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>AI & research providers</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-ink-soft">
          <p>AI provider: <span className="font-[var(--font-data)] text-ink">{process.env.AI_PROVIDER || "anthropic"}</span></p>
          <p>Research provider: <span className="font-[var(--font-data)] text-ink">{process.env.RESEARCH_PROVIDER || "mock"}</span></p>
          <p className="text-xs">
            Credential storage (BYOK) and per-org provider switching are a Phase 4 deliverable -- for now, providers
            are set via server environment variables.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scoring weights</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>ICP fit: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.icpFit * 100}%</span></p>
          <p>Intent: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.intent * 100}%</span></p>
          <p>Reachability: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.reachability * 100}%</span></p>
          <p className="text-xs text-ink-soft">Read-only in Phase 1. Configurable weights are a Phase 4 deliverable.</p>
        </CardContent>
      </Card>
    </div>
  );
}
