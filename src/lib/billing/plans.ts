// Plan definitions. Prices are intentionally `null` (not a guess like $29)
// until real per-campaign COGS data exists (see src/lib/billing/pricing-config.ts
// and docs/launch-checklist.md) -- setting a number here before that data
// exists is how you either under-price into negative margin or over-price
// out of adoption. The free tier's campaign cap is the one number this file
// commits to, and it's env-overridable so it can be tuned during the beta
// without a redeploy of logic.
export type PlanId = "free" | "starter" | "growth";

export interface Plan {
  id: PlanId;
  name: string;
  /** Campaigns allowed per calendar month. `null` = unlimited. */
  campaignsPerMonth: number | null;
  /** USD/month. `null` = not yet priced -- see comment above. */
  priceUsdPerMonth: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    // `||` not `??`: Number("") is 0, not NaN -- an env var accidentally
    // set to an empty string must not silently become "0 free campaigns."
    campaignsPerMonth: Number(process.env.FREE_PLAN_CAMPAIGNS_PER_MONTH || 3),
    priceUsdPerMonth: 0,
  },
  starter: {
    id: "starter",
    name: "Starter",
    campaignsPerMonth: null, // TODO: set once real COGS/campaign is measured
    priceUsdPerMonth: null,
  },
  growth: {
    id: "growth",
    name: "Growth",
    campaignsPerMonth: null, // TODO: set once real COGS/campaign is measured
    priceUsdPerMonth: null,
  },
};

export const DEFAULT_PLAN: PlanId = "free";

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}
