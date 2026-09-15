// A single, provider-agnostic seam for product analytics. Every call site
// that matters for "monitor the userbase" (see docs/launch-checklist.md)
// calls track() -- wired to PostHog's HTTP capture API directly (no SDK
// dependency, matching how the rest of this codebase talks to external
// APIs -- see src/lib/research/tavily-provider.ts and sec-edgar-provider.ts)
// rather than a no-op, so the free-tier "watch the userbase, then convert"
// plan actually produces data to look at.
export type AnalyticsEvent =
  | "signup"
  | "campaign_created"
  | "campaign_generate_succeeded"
  | "campaign_generate_failed"
  | "campaign_deleted"
  | "campaign_retried"
  | "quota_blocked"
  | "checkout_started"
  | "subscription_activated"
  | "subscription_canceled";

const POSTHOG_CAPTURE_URL = `${process.env.POSTHOG_HOST || "https://us.i.posthog.com"}/i/v0/e/`;
const REQUEST_TIMEOUT_MS = 5_000; // an analytics call must never meaningfully slow down the request it's describing

/**
 * Fires a PostHog event. Returns a Promise specifically so callers can
 * `await` it -- a fire-and-forget (unawaited) `fetch()` in a Vercel
 * serverless function risks never completing at all, since the function's
 * execution can be frozen the instant the response is sent, before a
 * background request finishes. Awaiting costs one fast HTTP round trip
 * (every call site here already runs inside an async route handler), which
 * is a better trade than analytics that silently don't arrive.
 *
 * Never throws: a PostHog outage or misconfiguration must not break the
 * real operation (a signup, a campaign creation) it's describing --
 * failures are logged and swallowed.
 */
export async function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): Promise<void> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return; // not configured yet -- see docs/launch-checklist.md

  // Prefer organizationId as the identity PostHog groups events by -- it's
  // the one id that's meaningful across this app (there's no per-user
  // product surface distinct from the org yet -- see docs/launch-checklist.md's
  // teams/seats item). Falls back to campaignId for the couple of events
  // that don't carry an organizationId, rather than fragmenting under
  // "unknown".
  const distinctId =
    (typeof properties.organizationId === "string" && properties.organizationId) ||
    (typeof properties.campaignId === "string" && properties.campaignId) ||
    "unknown";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[analytics] PostHog returned ${res.status} for "${event}"`);
    }
  } catch (err) {
    console.error(`[analytics] failed to send "${event}":`, err);
  } finally {
    clearTimeout(timeout);
  }
}
