import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { isPlanId, DEFAULT_PLAN } from "@/lib/billing/plans";
import { track } from "@/lib/analytics/track";
import type Stripe from "stripe";

// Stripe webhook endpoint -- keeps organizations.plan/subscriptionStatus in
// sync with what was actually paid for. Must read the raw body (not JSON)
// for signature verification, so this can't share the usual req.json() flow.
export async function POST(req: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 501 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${String(err)}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      const planId = session.metadata?.planId;
      if (organizationId && planId && isPlanId(planId)) {
        await db
          .update(organizations)
          .set({
            plan: planId,
            stripeSubscriptionId: (session.subscription as string) ?? null,
            subscriptionStatus: "active",
          })
          .where(eq(organizations.id, organizationId));
        await track("subscription_activated", { organizationId, planId });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = subscription.metadata?.organizationId;
      const planId = subscription.metadata?.planId;
      if (organizationId) {
        await db
          .update(organizations)
          .set({
            ...(planId && isPlanId(planId) ? { plan: planId } : {}),
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          })
          .where(eq(organizations.id, organizationId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = subscription.metadata?.organizationId;
      if (organizationId) {
        await db
          .update(organizations)
          .set({ plan: DEFAULT_PLAN, subscriptionStatus: "canceled" })
          .where(eq(organizations.id, organizationId));
        await track("subscription_canceled", { organizationId });
      }
      break;
    }

    default:
      break; // ignore anything we don't act on
  }

  return NextResponse.json({ received: true });
}
