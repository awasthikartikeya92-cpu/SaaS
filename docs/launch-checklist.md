# Launch checklist

What's built vs. what's left as a manual, human-only step — organized by
the roadmap discussed for going from "Phase 1 demo" to "live, monetizable
product." Nothing here needs re-explaining in chat; it's meant to be
worked through top to bottom.

## Already built in this pass

- **Generation is now a resumable series of short steps, not one long
  request** (`src/lib/agents/orchestrator.ts`, `POST /api/campaigns/[id]/step`,
  `src/components/dashboard/generation-progress.tsx`). This supersedes the
  entire "Pipeline reliability pass" below, which was a series of
  increasingly narrow fixes (raise the timeout, cap accounts, bound
  concurrency...) for one root problem: a free/Hobby Vercel plan gives a
  serverless function a **hard, non-negotiable 60s ceiling**, and this
  pipeline runs several sequential LLM calls before any account work even
  starts -- 3 real calls at even a generous 40s timeout is 120s worst case,
  already past that ceiling on its own, with no constant left to tune.
  - `runNextStep(campaignId)` does exactly ONE bounded unit of work (one
    agent call, essentially) per invocation and returns -- it's a state
    machine, not a pipeline: it looks at what's already persisted
    (`research_runs` rows for the shared offering/icp/signal/research
    stages, `accounts.status` for the per-account Contact -> GTM leg) and
    does whichever piece is next. No single call ever attempts more than
    one real LLM request, so there's structurally nothing left for a
    platform timeout to interrupt mid-pipeline.
  - The campaign page's `GenerationProgress` client component calls this
    endpoint in a loop (every step, immediately after the previous one
    returns) while a campaign is `draft`/`generating`, and shows real,
    persisted progress -- which stage, and "N of M accounts complete" --
    instead of a spinner with no information behind it. No queue service,
    no new Vercel add-on: the browser tab polling is what plays the role a
    background worker would on a paid tier.
  - `accounts` gained a `status` column (`pending` -> `contacted` -> `done`
    | `failed`) that doubles as this leg's work queue -- a row is inserted
    the moment research/verification identifies the company, before
    Contact or GTM have run, so it's visible and fills in live rather than
    the whole campaign staying blank until every account finishes.
    `icpFit`/`intent` are computed and stored at that same moment (neither
    depends on Contact); `reachability`/`opportunity` start at a `0`
    placeholder and are filled in once Contact runs -- the UI shows a
    status badge instead of a score for any account that isn't `done` yet,
    so a placeholder `0` is never shown as if it were a real score.
  - One account's Contact or GTM call failing still only fails that
    account (caught locally, `failureReason` recorded, account marked
    `failed`, the queue moves on) -- unchanged in spirit from the old
    per-account try/catch, just re-homed into this new structure. An error
    in one of the four *shared* stages (offering/icp/signal/research) has
    no "other accounts" to preserve, so it still fails the whole campaign,
    same as before.
  - Guarded against a real race: two overlapping `step` calls for the same
    campaign (a dev-mode double effect, two browser tabs open on the same
    page) could otherwise both see a shared stage as "not started" and
    both try to insert -- `offering_dna`/`icp_profiles`/`signal_taxonomies`
    all have a UNIQUE constraint on `campaignId`, so the loser's insert
    would throw and incorrectly fail the whole campaign over a harmless
    race. `stageGate()` checks for an in-flight (`status: "running"`)
    `research_runs` row first and just waits rather than restarting work
    someone else already claimed.
  - The old `POST /api/campaigns/[id]/generate` route (the one-shot,
    whole-pipeline endpoint) is deleted, not just deprecated -- `step` is
    the only way generation runs now.
  - Trade-off, stated plainly: a full campaign now visibly takes minutes
    (each of up to ~24 sequential steps for a 10-account campaign carries
    its own real network/LLM latency) rather than racing to finish under a
    minute. That's the honest cost of not exceeding a timeout that can't be
    raised on this plan -- and it comes with real progress on screen the
    whole time, instead of a coin-flip on whether a silent single request
    finishes before Vercel kills it.

- **Pipeline reliability pass** (superseded above, kept for history -- the
  timeout/concurrency numbers below no longer apply to how generation runs,
  but the schema-hardening and error-handling parts are still exactly as
  described), prompted by the first real campaign runs
  surfacing failure modes the 6-fixed-account mock provider never could:
  - **Platform timeout** (`src/app/api/campaigns/[id]/generate/route.ts`):
    added `maxDuration = 60`. Without it, Vercel kills the function at its
    default (10s on Hobby) once real accounts replace the mock ones -- and
    because that kill happens mid-flight, `runOrchestrator`'s own catch
    block never runs, leaving the campaign stuck at "generating" instead
    of cleanly "failed". This is likely the single biggest remaining
    source of stuck campaigns if account volume grows -- see the account
    cap below for the other half of the fix.
  - **Tavily calls now run in parallel**, not sequentially -- 5 signals at
    the old 15s timeout each could take 75s sequentially, longer than the
    entire function's budget, on its own. Timeout also tightened to 10s.
  - **Anthropic calls now have a 25s timeout** (`src/lib/ai/anthropic-provider.ts`)
    -- same reasoning: a hung call must fail within the function's budget,
    not run until the platform kills the whole thing.
  - **Discovered accounts are capped and prioritized**
    (`MAX_ACCOUNTS_PER_CAMPAIGN`, default 10, most-corroborated-evidence
    first) and **processed with bounded concurrency** (3 at a time,
    `src/lib/agents/orchestrator.ts`) instead of one at a time -- a real
    research provider can return far more than 6 companies, and each one
    costs 2 sequential-feeling LLM calls; unbounded and sequential, that
    easily exceeds the time budget on its own.
  - **One account's failure no longer sinks the whole campaign** -- each
    account is now wrapped in its own try/catch inside the concurrency
    pool, so a model error or bad JSON on account #4 doesn't stop accounts
    #1-3 (already done) or #5-10 (still queued) from completing.
  - **Zod schemas hardened** (`src/lib/agents/schemas.ts`) against real
    LLM formatting variance: stringified numbers ("200000" instead of
    200000), confidence given on a 0-100 scale instead of 0-1, a field
    omitted entirely instead of written as `null`, and a wrong-shaped
    array (string instead of `string[]`) all now degrade gracefully
    instead of failing the agent. Required identity fields (a title, an
    angle, `coreProblem`) are deliberately left strict -- those failing is
    a real problem worth surfacing, not something to paper over.
  - **maxTokens raised to 8192** for Offering and GTM (the two
    longest-output agents) -- the old 4096 default risked truncating
    valid JSON mid-object on a detailed offering or a long draft email,
    which failed identically to a genuinely malformed response.
  - Still an open, structural risk even after all of the above: a large
    enough discovered-account universe can still exceed even a 60s budget
    (Vercel's Hobby ceiling) run through a single HTTP request. If that
    happens in practice, the real fix is decoupling generation from the
    request/response cycle entirely (a background job/queue), not another
    round of tuning constants -- worth raising `maxDuration` if you're on
    Pro (up to 300s, more with Fluid compute) as a stopgap first.
  - **Update, confirmed in production, not just theoretical**: a real
    campaign failed at offering-agent with a raw `Request timed out.` --
    diagnosed by reading the Anthropic SDK's own retry logic
    (`node_modules/@anthropic-ai/sdk/client.js`): a connection *timeout* is
    retried unconditionally regardless of `maxRetries`'s normal 4xx/5xx
    rules, and the retry gets the *same* timeout budget again. With the
    `maxRetries: 1` this pipeline had set, one slow-but-otherwise-fine
    25s+ response silently became two full 25s attempts back to back
    (~50s+ wall clock) before finally throwing -- indistinguishable from a
    broken key from the UI, but not actually one. Fixed in
    `src/lib/ai/anthropic-provider.ts`: `maxRetries: 0` (every agent call
    already runs inside its own try/catch via `logRun`, and one account's
    failure doesn't sink the campaign, so a timeout retry here buys nothing
    worth doubling the exposure for) and the base timeout raised
    25s -> 40s, since 25s proved too tight for a real, valid, large
    completion. Also fixed the failure card's hint text
    (`src/app/(dashboard)/campaigns/[id]/page.tsx`), which used to always
    say "usually a missing/invalid ANTHROPIC_API_KEY" regardless of the
    actual error -- it now matches the real error text instead.
  - This also makes the sequential-calls risk above concrete rather than
    hypothetical: offering-agent -> icp-agent -> signal-agent run one after
    another before any account work starts, so even without any retry,
    3 real (not mock) calls at a 40s cap is 120s worst case -- already past
    Hobby's 60s ceiling on its own, before Research/Contact/GTM run at all.
    If timeouts recur after this fix, the two real options are: raise
    `maxDuration` in `src/app/api/campaigns/[id]/generate/route.ts` past 60
    (requires Vercel Pro or higher -- Hobby hard-clamps to 60 regardless of
    what's set), or do the background-job decoupling mentioned above. Tune
    constants only gets you so far against a fundamentally synchronous,
    single-HTTP-request pipeline.
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
