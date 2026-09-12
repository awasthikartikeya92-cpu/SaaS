import Stripe from "stripe";

let cached: Stripe | null = null;

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Throws if Stripe isn't configured yet -- callers should check isBillingConfigured() first and return a friendly response instead of letting this throw reach the client. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set -- billing isn't configured yet. See docs/launch-checklist.md."
    );
  }
  cached = new Stripe(key);
  return cached;
}
