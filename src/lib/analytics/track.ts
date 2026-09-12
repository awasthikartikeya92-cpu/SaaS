// A single, provider-agnostic seam for product analytics. Every call site
// that matters for "monitor the userbase" (see docs/launch-checklist.md)
// calls track() now; wiring it to a real provider later is a one-file
// change instead of hunting down every call site.
//
// No-ops until an analytics key exists, so this ships without forcing a
// PostHog/Amplitude/etc. account decision today.
export type AnalyticsEvent =
  | "signup"
  | "campaign_created"
  | "campaign_generate_started"
  | "campaign_generate_succeeded"
  | "campaign_generate_failed"
  | "quota_blocked"
  | "checkout_started"
  | "subscription_activated"
  | "subscription_canceled";

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  const key = process.env.POSTHOG_KEY;
  if (!key) return; // not configured yet -- see docs/launch-checklist.md

  // TODO: send to the chosen provider once POSTHOG_KEY (or equivalent) is
  // set. Left as the single integration point on purpose -- no call site
  // above this file should need to change when that happens.
  void event;
  void properties;
}
