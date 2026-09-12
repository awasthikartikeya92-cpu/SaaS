import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { track } from "@/lib/analytics/track";

const BodySchema = z.object({ planId: z.string() });

// Maps a plan id to the Stripe Price object that represents it. Kept as an
// env var per plan (rather than hardcoded price IDs) so switching from
// Stripe test mode to live mode, or repricing a plan, is a config change.
function priceIdFor(planId: string): string | undefined {
  return process.env[`STRIPE_PRICE_ID_${planId.toUpperCase()}`];
}

export async function POST(req: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't configured yet -- see docs/launch-checklist.md." },
      { status: 501 }
    );
  }

  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success || !isPlanId(parsed.data.planId)) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }
  const planId = parsed.data.planId;
  const plan = PLANS[planId];
  const priceId = priceIdFor(planId);
  if (!plan.priceUsdPerMonth || !priceId) {
    return NextResponse.json(
      { error: `Plan "${planId}" isn't priced/configured for checkout yet.` },
      { status: 400 }
    );
  }

  const organizationId = session.user!.organizationId as string;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const stripe = getStripe();
  const origin = new URL(req.url).origin;

  const customerId =
    org.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: session.user!.email ?? undefined,
        metadata: { organizationId },
      })
    ).id;

  if (!org.stripeCustomerId) {
    await db.update(organizations).set({ stripeCustomerId: customerId }).where(eq(organizations.id, organizationId));
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/settings?checkout=canceled`,
    metadata: { organizationId, planId },
    // Also stamped on the subscription itself (not just this Checkout
    // Session) so the webhook can resolve organizationId/planId on
    // customer.subscription.* events, which don't carry Session metadata.
    subscription_data: { metadata: { organizationId, planId } },
  });

  track("checkout_started", { organizationId, planId });

  return NextResponse.json({ url: checkoutSession.url });
}
