# Launch checklist

What's built vs. what's left as a manual, human-only step — organized by
the roadmap discussed for going from "Phase 1 demo" to "live, monetizable
product." Nothing here needs re-explaining in chat; it's meant to be
worked through top to bottom.

## Already built in this pass

- **AI usage instrumentation** (`src/lib/ai/usage-context.ts`,
  `src/lib/billing/usage-tracking.ts`, `ai_usage_events` table): every
  Anthropic call made through the orchestrator now logs exact input/output
  token counts per organization/campaign/agent. `getCampaignUsage()` and
  `getOrganizationUsageThisPeriod()` (in `usage-tracking.ts`) give you the
  real per-campaign and per-org cost breakdown once real campaigns run.
- **Free-tier quota enforcement** (`src/lib/billing/plans.ts`,
  `src/lib/billing/quota.ts`): campaign creation is capped at
  `FREE_PLAN_CAMPAIGNS_PER_MONTH` (default 3) per organization per calendar
  month, enforced in `POST /api/campaigns` (returns HTTP 402 with the
  current usage/limit when exceeded).
- **Stripe billing scaffolding** (`src/lib/billing/stripe.ts`,
  `/api/billing/checkout`, `/api/billing/webhook`): dormant until
  `STRIPE_SECRET_KEY` is set — the routes return 501 instead of erroring, so
  the app behaves exactly as before until you turn this on.
- **Product analytics seam** (`src/lib/analytics/track.ts`): no-ops until
  `POSTHOG_KEY` is set; call sites already exist at signup-adjacent events
  (campaign created, quota blocked, generate started/succeeded/failed,
  checkout started, subscription activated/canceled).
- **Postgres, live** (`src/lib/db/schema.ts`, `src/lib/db/index.ts`,
  `drizzle.config.ts`): the SQLite path from Phase 1 is gone. Runtime
  queries use the pooled connection (`STORAGE_POSTGRES_URL`, from Vercel's
  Prisma Postgres storage add-on); migrations use the direct one
  (`STORAGE_DATABASE_URL`); both fall back to plain `DATABASE_URL` for any
  other Postgres host. Migration SQL is generated and committed
  (`drizzle/`).
- **Legal drafts** (`legal/terms.md`, `legal/privacy.md`): founder-drafted
  starting points, explicitly marked as needing attorney review.

## What's still a manual step

### 0. Remove the bootstrap deploy hack once the first deploy succeeds
`package.json`'s `vercel-build` script currently runs
`drizzle-kit push --force && (tsx scripts/seed.ts || true) && next build`
instead of plain `next build`. This exists only because the sandbox this
was built in can't make raw TCP connections (only HTTP/S through a proxy),
so `db:push`/`db:seed` couldn't be run directly against Postgres — routing
them through Vercel's build step (which has normal network access) was the
only way to get the schema created and the demo account seeded. Two things
to do once you've confirmed the first deploy works (signed in, campaign
page loads):
- Remove `vercel-build` from `package.json` entirely (falls back to the
  plain `build` script). Leaving `--force` schema pushes wired into every
  deploy risks silently truncating a column on some future schema change —
  fine for bootstrapping an empty database, not for an ongoing app.
- The seed step is guarded with `|| true` so a second deploy won't fail
  outright, but it'll leave an orphaned duplicate "Ridgeline Ops (demo)"
  organization row (no login) if it ever runs twice before you remove it —
  worth a quick manual cleanup if that happens.

### 0.5. There's no signup flow yet
Found while wiring this up: the only way to get a user into the database
right now is `scripts/seed.ts` — there's no `/register` route or page. That
was invisible in Phase 1 because everything ran against the seeded demo
account. This has to exist before a real stranger can use the product; it's
a real feature to build (an API route + page, reusing the existing
`bcryptjs` hashing and `organizations`/`users` tables), not a config
change like everything else on this list.

### 1. Your own Anthropic key, in production
- Set `ANTHROPIC_API_KEY` as a Vercel environment variable (never commit
  it). Every user — free and paid — runs through this one key.
- **Set a monthly spend cap in the Anthropic Console.** This is the
  backstop against a bug or abuse burning through budget unattended; the
  app-level quota above is the first line of defense, this is the second.
- Optionally set `ANTHROPIC_MODEL` if you want something other than the
  current default in `anthropic-provider.ts`.

### 2. Turn token counts into real pricing
- Run a handful of real campaigns once #2 is done.
- Query `getCampaignUsage(campaignId)` / `getOrganizationUsageThisPeriod(orgId)`
  (`src/lib/billing/usage-tracking.ts`) to see real input/output tokens per
  agent.
- Fill in `src/lib/billing/pricing-config.ts` with your model's actual
  $/million-token rates (from your provider's current pricing page) — it's
  intentionally empty right now rather than guessed.
- Once you know real $/campaign, set `starter`/`growth` pricing in
  `src/lib/billing/plans.ts` and adjust `FREE_PLAN_CAMPAIGNS_PER_MONTH` if
  the current default of 3 turns out too generous or too stingy relative
  to when users actually see value.

### 3. Turn on billing
- Create a Stripe account, get `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`, point a webhook endpoint at
  `/api/billing/webhook` for `checkout.session.completed`,
  `customer.subscription.updated`, and `customer.subscription.deleted`.
- Create a Stripe Price object per paid plan once #3 has set real prices,
  and set `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_GROWTH`.
- Decide the free-cohort transition (grandfather vs. notice-then-convert)
  before flipping this on for existing users — see Terms §3.

### 4. Legal
- Have `legal/terms.md` and `legal/privacy.md` reviewed by an attorney,
  fill in the `[ ]` placeholders, and link them from the app (signup
  screen, footer) before real users sign up.

### 5. Optional, not yet scaffolded
- Error monitoring (e.g. Sentry) — not wired up in this pass; worth adding
  before real users hit production.
- Real research provider (Tavily/Exa/Serper) — still mock data per the
  Phase 1 README; this is the other cost center once it's live, and should
  get the same usage-instrumentation treatment as the Anthropic calls.
