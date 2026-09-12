import { db } from "@/lib/db";
import { campaigns, organizations } from "@/lib/db/schema";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { PLANS, DEFAULT_PLAN, isPlanId, type PlanId } from "./plans";

export class QuotaExceededError extends Error {
  constructor(
    public planId: PlanId,
    public limit: number,
    public used: number
  ) {
    super(
      `Campaign quota reached for the "${planId}" plan (${used}/${limit} this month). Upgrade to create more.`
    );
    this.name = "QuotaExceededError";
  }
}

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getOrganizationPlan(organizationId: string): Promise<PlanId> {
  const [org] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org && isPlanId(org.plan) ? org.plan : DEFAULT_PLAN;
}

/**
 * Throws QuotaExceededError if creating one more campaign would put this org
 * over its plan's monthly cap. Call this BEFORE inserting the campaign row
 * (see src/app/api/campaigns/route.ts) -- it's a pre-check, not a rollback.
 */
export async function assertCanCreateCampaign(organizationId: string): Promise<void> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];
  if (plan.campaignsPerMonth == null) return; // unlimited, or not yet capped (paid plans pre-pricing)

  const periodStart = currentPeriodStart();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        gte(campaigns.createdAt, periodStart),
        // A campaign that failed (bad API key, model error, etc.) never
        // consumed the resources the quota exists to cap -- don't charge
        // the org's monthly allowance for it.
        ne(campaigns.status, "failed")
      )
    );

  if (count >= plan.campaignsPerMonth) {
    throw new QuotaExceededError(planId, plan.campaignsPerMonth, count);
  }
}
