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
- **Per-agent model selection** (`src/lib/ai/model-config.ts`): Offering/
  ICP/Signal/GTM run on the "strong" model (`claude-sonnet-5` by default),
  Contact -- which just picks a job title, once per account, never
  user-facing -- runs on the "fast" one (`claude-haiku-4-5-20251001`).
  `ANTHROPIC_MODEL_STRONG`/`ANTHROPIC_MODEL_FAST` override either tier;
  `ANTHROPIC_MODEL` alone still works as a full blanket override for
  everything if you'd rather go back to one model. Once #2 below has real
  per-agent cost numbers, revisit whether this split is actually saving
  meaningful money or whether Contact's quality took a real hit for it.
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
  starting points, explicitly marked as needing attorney review -- now
  actually reachable at `/terms` and `/privacy` (rendered from the same
  files, so editing the `.md` is the only thing needed once they're
  reviewed) and linked from the signup page.
- **Signup flow** (`/signup`, `POST /api/auth/register`): creates an
  organization + user, hashes the password, and signs them in. Rate-limited
  by IP (`src/lib/auth/rate-limit.ts`, `signup_attempts` table, 5/hour by
  default via `SIGNUP_MAX_PER_IP_PER_HOUR`) -- a deterrent against
  mass-creating free orgs to bypass the per-org campaign quota, not a real
  defense (an attacker rotating IPs still gets through). Real abuse
  prevention (email verification, CAPTCHA) is still open -- see below.
  The login page no longer pre-fills the demo password now that real
  signups exist.
- **Quota error messages fixed**: `campaigns/new` and the checkout button
  now show the actual error text instead of a raw JSON blob when a request
  fails (402 quota, checkout errors, etc.).
- **Plan & usage visible in Settings**: current plan, this month's AI
  token/cost usage per agent (from the instrumentation above), and an
  Upgrade button per paid plan -- hidden until that plan actually has a
  price set in `src/lib/billing/plans.ts`.
- **Real marketing landing page** (`src/app/page.tsx`): `/` now serves an
  actual pitch to signed-out visitors instead of redirecting straight to
  `/login` -- positioning built around the SMB/mid-market-vs-enterprise-
  intent-data-platforms GTM, product preview built from the app's own real
  UI components (no stock photography, no fabricated logos/testimonials/
  pricing numbers).
- **Tavily research provider** (`src/lib/research/tavily-provider.ts`):
  `RESEARCH_PROVIDER=tavily` replaces mock data with real web/news search.
  Written against Tavily's documented API from training knowledge, not
  verified live -- both `docs.tavily.com` and `api.tavily.com` are blocked
  from this environment. The first real campaign run with this set is the
  actual test.

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
- Have `legal/terms.md` and `legal/privacy.md` reviewed by an attorney and
  fill in the `[ ]` placeholders -- they're already linked from `/signup`
  and live at `/terms`/`/privacy`, so no code change is needed once the
  content is final, just edit the `.md` files.

### 5. Real abuse prevention on signup
The IP-based rate limit (`src/lib/auth/rate-limit.ts`) is a speed bump, not
a real defense -- it stops a script hitting `/api/auth/register` in a tight
loop, not someone deliberately rotating IPs to keep creating free orgs and
bypassing the campaign quota. If free-tier abuse shows up in the usage
data from #2, the real fix is one of: require email verification before a
new org can generate a campaign (needs an email-sending provider -- Resend
is the simplest to wire up), or add a CAPTCHA (e.g. Cloudflare Turnstile)
to the signup form.

### 6. Optional, not yet scaffolded
- Error monitoring (e.g. Sentry) — not wired up in this pass; worth adding
  before real users hit production.
- Real research provider (Tavily/Exa/Serper) — still mock data per the
  Phase 1 README; this is the other cost center once it's live, and should
  get the same usage-instrumentation treatment as the Anthropic calls.
- Password reset / "forgot password" -- there's no self-serve flow yet;
  handle it manually (reset via `db:seed`-style script, or a direct DB
  update) until this exists.
