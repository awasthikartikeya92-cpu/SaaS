# Launch checklist

What's built vs. what's left as a manual, human-only step — organized by
the roadmap discussed for going from "Phase 1 demo" to "live, monetizable
product." Nothing here needs re-explaining in chat; it's meant to be
worked through top to bottom.

## Already built in this pass

- **Prompt caching for the two agents that repeat real work** -- Contact
  and GTM run once per account (`src/lib/agents/contact-agent.ts`,
  `gtm-agent.ts`), up to `MAX_ACCOUNTS_PER_CAMPAIGN` times per campaign,
  each time re-sending the *same* Offering DNA (and, for Contact, ICP) the
  model has already seen for every other account in that campaign. Before
  this, that shared context was serialized into one JSON blob with the
  volatile `companyName` sitting first, so every byte of every call was
  unique and there was nothing for Anthropic's prefix-based caching to
  match against.
  - `src/lib/ai/provider.ts`: `AiMessage.content` now also accepts an
    ordered list of `{text, cacheable?}` segments alongside the existing
    plain-string form -- a provider-agnostic way to mark "this text repeats
    across many calls" without leaking Anthropic's own request shape into
    the interface every agent codes against. A provider without
    server-side caching (the still-unimplemented OpenAI stub) would just
    concatenate every segment into one string; nothing here required
    OpenAI-specific code because there isn't any yet to change.
  - `src/lib/ai/anthropic-provider.ts` also now marks every agent's
    **system prompt** cacheable, unconditionally -- every agent's SYSTEM
    constant is a fixed string literal, identical across every call to
    that agent for every account, every campaign, every organization, so
    there's no case where this could be wrong to do, only degrees of how
    much it helps.
  - Contact/GTM now split their payload into a cacheable segment
    (offeringDna, +icp for Contact) and a volatile one (companyName,
    signals, recommendedTitle) instead of one combined JSON.stringify.
  - Verified with a real request-shape capture (mocked `fetch`, not just
    reading the code): confirmed the cacheable segment is **byte-identical
    across two different accounts in the same campaign** -- the exact
    condition that actually determines whether Anthropic's cache hits at
    all -- that no per-account data leaks into it, that offeringDna isn't
    duplicated into the volatile segment (which would silently defeat the
    whole point), and that `cache_control` lands on exactly the intended
    segment. Kept as permanent tests
    (`src/lib/agents/prompt-caching.test.ts`), not a one-off script.
  - Honest limit: Anthropic requires a minimum token count for a cacheable
    segment to actually be cached (a few hundred to ~1-2k tokens depending
    on model) -- below that, the `cache_control` marker is accepted but
    silently doesn't cache anything. A very small Offering DNA + ICP on a
    lightly-described offering may not clear that bar; there's no error or
    downside either way, just no benefit for that campaign specifically.
    Not verified against a live response (no reachable Anthropic key in
    this sandbox -- same restriction as everywhere else it's been noted)
    -- `response.usage.cache_read_input_tokens` on a real second-account
    call is the actual confirmation once this deploys.
- **A health check that actually checks something**
  (`src/app/api/health/route.ts`) -- used to return `{ ok: true }`
  unconditionally, without touching anything, so it could not detect the
  single most likely real outage (the database being unreachable or out of
  connections) and would report healthy for the entire time the app was
  actually down for every real user. Now runs a trivial `select 1` through
  the same `db` client every real query uses, returning 503 with the error
  detail if it fails. Deliberately not a deeper readiness probe (asserting
  something about schema/migration state) -- that's a different, heavier
  check than "is the connection this app depends on alive."
- **All three outreach drafts rendered, channel-appropriate, with a real
  copy affordance** (`src/components/dashboard/outreach-channels.tsx`, new;
  wired into `accounts/[id]/page.tsx`). The GTM agent has always generated
  `draftEmail`, `draftLinkedIn`, and `callOpener` on every account -- real
  token cost every time -- but only `draftEmail` was ever shown, inside a
  collapsed `<details>` with no way to copy it. Now:
  - Tabbed by channel (Email / LinkedIn / Call opener), not three stacked
    blocks -- a salesperson already knows which channel they're using, so
    showing all three at once is just scrolling past two they won't use
    right now.
  - The call opener is styled distinctly (larger, quoted, the display
    font) from the two written channels -- it's meant to be glanced at
    right before speaking, not read as a document, so it shouldn't look
    like one.
  - A real copy-to-clipboard button per channel, with visible confirmation
    (icon + label swap to a checkmark and "Copied," reverting after ~2s),
    replacing "select the text by hand."
  - Fixed a real mobile bug found while checking this: at a 390px
    viewport, "Call opener" wrapped onto two lines, leaving the tab row
    visibly lopsided against its neighbors -- a `shortLabel` ("Call")
    swaps in below the `sm` breakpoint so all three tabs stay on one line
    without clipping or an unexplained horizontal scroll.
  - The "Recommended outreach" card moved out of the 2-column grid it
    shared with "Recommended persona" into its own full-width row -- once
    it holds three tabs and potentially long drafts, squeezing it next to
    a much shorter card produced an awkward height mismatch.
  - Verified by actually rendering the component (not just reading the
    code): a temporary, unlinked preview route rendered `OutreachChannels`
    with realistic sample data (this sandbox can't reach the live
    database the real page needs) and was screenshotted at desktop and
    390px via Playwright -- caught the tab-wrapping bug above, which
    reading the code alone would not have caught. The route, and the
    temporary middleware exemption it needed, were both removed before
    this shipped; nothing about them is in the diff.
  - `scripts/seed.ts`'s demo accounts now have real (not `null`) content
    for all three fields, personalized per account the same way `angle`/
    `talkingPoints` already were, so the demo actually shows this off.
- **Tests + CI on the deterministic core, and DB indexes/foreign keys/
  cascading delete.** Second pass after the audit's P0 fixes above --
  closes out the P1 tier: tests, DB integrity, and real analytics.
  - `npm test` (vitest, `.github/workflows/ci.yml` runs it on every push/
    PR alongside typecheck/lint/build): 38 tests across
    `src/lib/scoring/`, `src/lib/agents/schemas.ts`'s `parseJson`,
    `src/lib/agents/verification-agent.ts`, and a new
    `src/lib/agents/stage-decision.ts` -- the resumable pipeline's core
    done/in-flight/not-started decision, pulled out of orchestrator.ts
    specifically so it's testable without a live Postgres connection
    (importing that file at all throws immediately without a real
    connection string -- see src/lib/db/index.ts). See README.md's "What's
    tested" for the full list; several tests are explicit regression
    guards for the exact scoring bugs fixed just above.
  - `src/lib/db/schema.ts`: every table now has proper foreign keys (20
    constraints, all `ON DELETE cascade`) and indexes (19, matched to the
    actual query patterns in `queries.ts`/`orchestrator.ts` -- e.g.
    `accounts(campaign_id, status)` for the resumable pipeline's hottest
    query). Deliberately excluded: `ai_usage_events` has no FK to
    campaigns/organizations at all -- it's a billing/audit trail, and
    either a hard constraint (blocks deleting any campaign that ever made
    an AI call -- i.e. all of them) or a cascade (silently erases the
    record that money was spent) would be wrong; see that table's comment
    in schema.ts. Migration: `drizzle/0003_fine_the_hand.sql`.
    **Risk, stated plainly**: this ships as a single migration applied via
    the existing `drizzle-kit push --force` in `vercel-build`. Adding a
    FOREIGN KEY constraint fails if any existing row already violates it
    (an orphaned reference). That's fail-safe, not silently destructive --
    Vercel won't cut over to a build that failed, so current production
    stays live either way -- but if your first deploy after this fails,
    that's almost certainly why; the build log will name the exact
    constraint and table.
  - **Campaigns can finally be deleted** (`DELETE /api/campaigns/[id]`, a
    delete button on both the campaigns list and campaign detail pages).
    There was no delete path anywhere in the app before this -- a wasted
    free-tier slot (a typo'd test campaign, one that failed and can't be
    retried) was permanent, since quota counts campaigns. Deleting a
    campaign cascades to everything it produced (accounts, signals,
    contacts, outreach, research runs/sources, reports) via the FK
    constraints above -- one delete, not a manual cleanup script. Usage/
    billing history for that campaign deliberately survives (see the
    ai_usage_events note above).
  - **Analytics actually send now** (`src/lib/analytics/track.ts`) --
    previously a no-op even with `POSTHOG_KEY` set (a literal `void event;
    void properties;` TODO). Posts directly to PostHog's HTTP capture API
    (no SDK dependency, same pattern as the Tavily/SEC EDGAR research
    providers) with a 5s timeout and swallowed errors -- an analytics
    outage must never break the real operation it's describing. Every call
    site now `await`s it (serverless functions can freeze immediately
    after sending a response, so a fire-and-forget call risked never
    actually being sent); `distinct_id` prefers `organizationId` since
    that's the one identity meaningful across this app today. Also fixed a
    duplicate-event risk in the generate-step route: a stray poll after
    the client already saw "active"/"failed" would previously re-fire the
    success/failure event on every redundant call, not just the one real
    transition.
- **Fixed cross-tenant data exposure on every detail route** (a full
  product audit found this, consistently, in 4 places): campaign detail,
  account detail, and report detail pages all fetched their resource by id
  alone, with no check that it belonged to the caller's organization; the
  campaign generate-step and report-creation API routes had the same gap.
  `getOwnedCampaign()` (`src/lib/db/queries.ts`) is now the single source
  of truth -- organizationId is filtered in the SQL WHERE clause itself,
  and it's a required parameter everywhere a campaign is looked up, so
  TypeScript itself catches a call site that forgets it (verified: the
  refactor's `tsc` pass caught every downstream call site with zero missed
  spots). See the commit for the full list of affected routes.
- **The Opportunity score can now actually vary** -- the same audit found
  it was effectively a coin flip disguised as a formula: icpFit was 71.3
  on every account in every campaign (the "does industry match?" check was
  tautological -- industry was assigned from the exact ICP array it was
  then compared against) and reachability was exactly 24 always (the
  early-return branch in `computeReachability` discarded
  `contactConfidence` entirely). Combined, two of the formula's three
  inputs were dead weight, and neither Hot (>=75) nor Emerging (<50) was
  reachable by any account, ever.
  - `computeReachability` now blends in `contactConfidence` even without a
    verified decision maker (at reduced weight -- verified still matters
    far more), instead of discarding it.
  - `computeRoleRelevance` (new, `src/lib/scoring/index.ts`) replaces a
    flat 80 with a real check: does the Contact Agent's recommended title
    actually match one of the buyer personas the Offering Agent derived
    from what the user described.
  - The tautological `industryMatch` check is gone -- flattened to the
    same honestly-labeled placeholder as icpFit's other sub-scores (real
    variance here needs real firmographic data, which isn't connected
    yet -- see the SEC EDGAR/firmographics item below).
  - `computeIntent` no longer double-counts `confidence` under two names
    (`strength` was always `confidence * 100` in every caller -- there's
    no independent "signal strength" measurement anywhere in the pipeline
    today) and no longer silently defaults nearly every signal to the
    weakest tier (it was looking up each signal's tier with a *different,
    stricter* match than the one used to persist that signal's tier in the
    first place, so the two almost never agreed).
  - Hot/Warm/Emerging thresholds recalibrated (68/55, was 75/50) to match
    the real achievable range now that icpFit is an honest flat 65 instead
    of a fake-precise 71.3 -- both tiers are reachable again. The
    Overview page's "ICP matches" KPI (tautologically 100% of accounts,
    for the same reason) is now "Verified accounts" -- real data reused
    from what's already fetched, not a new query.
  - Deliberately NOT fixed by inventing plausible-looking variance:
    icpFit's other placeholder sub-scores (geography/size/business model/
    tech) stay flat and clearly labeled as such until real firmographic
    data exists. Faking that data to look more precise would repeat the
    exact mistake being fixed here, just relocated.
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

- **SEC EDGAR full-text search as a second, additive signal source**
  (`src/lib/research/sec-edgar-provider.ts`, `src/lib/research/composite-provider.ts`):
  free, no API key, searches the actual text of 10-K/10-Q/8-K filings for
  taxonomy signal names. This is the intentional counterpart to Tavily's
  general web/news search -- Tavily finds news chatter about a company,
  this finds what a public company has formally *disclosed* (a capex
  increase, a new risk factor, an 8-K material agreement). It's additive,
  not a replacement: set `SEC_EDGAR_ENABLED="true"` alongside whatever
  `RESEARCH_PROVIDER` you're already using and `CompositeResearchProvider`
  merges both providers' evidence (one failing doesn't drop the other's
  results). Rationale for building this despite an SMB-focused product:
  the SMB *customer* is not the same as the SMB customer's *ICP* -- a
  small vendor's own target accounts are very often large, public
  enterprises that do file with the SEC, even though the vendor itself
  doesn't. Requires `SEC_EDGAR_USER_AGENT` (SEC blocks requests without a
  descriptive User-Agent identifying the requester -- this throws a clear
  setup error if `SEC_EDGAR_ENABLED` is true and it's missing, rather than
  failing silently with a mysterious 403 later). Like Tavily, this is
  written against SEC EDGAR's documented API from training knowledge --
  `efts.sec.gov` is blocked by this sandbox's network egress policy
  (verified with a direct curl test), so it hasn't run against a live
  response. Unlike Tavily, the pure parsing/URL-building logic (ticker
  stripping, canonical filing URL construction, and the fallback for a hit
  missing every plausible snippet field) was exercised against fixture
  data standalone and confirmed correct -- see the file's own comments for
  the one specific detail (the highlighted-snippet field name) that's an
  educated guess rather than a confirmed fact, and degrades to an honest,
  non-fabricated description instead of guessing at filing content if
  wrong. The first real campaign run with this enabled is the actual test.
  Next in this direction (not yet built): USASpending.gov/SAM.gov federal
  contract-award data as the closest free, public equivalent signal for
  *private* companies (which won't appear in SEC EDGAR at all), and real
  firmographic enrichment (employeeCount/geography are still hardcoded
  placeholders in `src/lib/agents/orchestrator.ts`'s account-seeding step).

- **A dashboard that actually works on a phone**
  (`src/components/dashboard/dashboard-shell.tsx`, new;
  `src/app/(dashboard)/layout.tsx` now delegates to it). The sidebar used
  to be a plain fixed-width `<aside>` with no responsive behavior at all --
  at a 390px viewport it ate more than half the screen, permanently, with
  no way to dismiss it. Now: below the `md` breakpoint the sidebar is
  replaced by a slim top bar (wordmark + hamburger button); tapping it
  slides the same nav in from the left as an overlay drawer with a
  click-to-dismiss backdrop, Escape-to-close, and `document.body.overflow`
  locked while open so the page underneath doesn't scroll. At `md` and
  above it's the original static sidebar, unchanged -- desktop layout,
  nav order, and the user-email/sign-out footer are all pixel-identical to
  before. Also fixed two detail-page grids (`campaigns/[id]/page.tsx`'s
  Offering DNA and ICP tabs, `campaigns/new/page.tsx`'s target
  industries/geographies fields) that were hardcoded `grid-cols-2` and
  would compress long labels into unreadably narrow columns below `sm` --
  now `grid-cols-1 sm:grid-cols-2`.
  - Verified visually, not just by reading the code: rendered the real
    component tree (a temporary, unlinked preview route, deleted before
    this shipped -- this sandbox has no reachable Postgres for the real
    authenticated layout to hit) and screenshotted desktop, mobile
    drawer-closed, mobile drawer-open, and post-backdrop-click-close with
    a real headless browser at a 390px width. Caught and fixed one real
    bug this way that reading the code alone did not surface: the `"use
    server"` action is passed through `DashboardShell` as an ordinary
    prop, which is exactly the shape Next.js rejects at runtime
    ("Event handlers cannot be passed to Client Component props") if the
    action isn't a genuine Server Action -- confirmed the real
    `layout.tsx`/`onSignOut` wiring already does this correctly and the
    pattern works end-to-end.
  - Tables (`src/components/ui/table.tsx`) already self-wrap in an
    `overflow-x-auto` container, so the accounts/signals tables needed no
    change -- checked, not assumed.

- **Fixed: campaigns failing repeatedly, at different agents, with no error
  text shown.** Full RCA before any code changed -- two distinct, real bugs,
  both fixed:
  - **Silent failure attribution** (`src/lib/agents/orchestrator.ts`): each
    shared stage (offering/ICP/signal/research) called its LLM agent inside
    `logRun()` (which records success/error on that stage's `research_runs`
    row) but then persisted the result to the database in a separate step
    *after* `logRun` had already returned and marked that row "success". If
    that persistence step itself threw, the error skipped straight past
    `logRun`'s own error handling to `runNextStep()`'s outer catch, which
    only knows how to mark the whole campaign "failed" -- with no idea
    which stage or why. Symptom, reproduced exactly from a real failed
    campaign's screenshot: the failure card read "Generation failed at
    icp-agent" with **no error text at all**, while the same page's "what
    already completed" summary claimed "ICP: done" -- both true from the
    data's point of view (the icp-agent *run* had succeeded; the *insert*
    after it hadn't), just impossible to diagnose from the UI. Fixed by
    moving each stage's persistence inside the same callback `logRun`
    awaits, so any failure -- the LLM call or the write that turns its
    output into rows -- lands on that run's `error` column where the
    failure card actually reads it.
  - **The concrete trigger for the icp-agent case specifically**:
    `icp_profiles.revenue_min`/`revenue_max` were Postgres `integer`
    columns (max ~2.147B). This product's own ICP is routinely a large
    public enterprise (an SMB vendor's target account, not the vendor
    itself -- see the SEC EDGAR section above), and a revenue figure in
    raw dollars for one of those regularly exceeds that ceiling --
    inserting a `revenueMax` of, say, $50B threw "value out of range for
    type integer". Fixed by widening both columns to `doublePrecision`
    (migration `drizzle/0004_thin_jack_flag.sql`); the actual production
    schema is applied via `drizzle-kit push --force` in `vercel-build`
    (see item #0 below), not this migration file, but it's generated and
    committed for the historical record like the others.
  - **A second, coexisting reliability gap found during the same RCA**
    (`src/lib/ai/anthropic-provider.ts`): `maxRetries: 0` was set earlier
    to stop a connection *timeout* from being retried unconditionally by
    the Anthropic SDK (verified against the SDK's own retry logic in
    `node_modules/@anthropic-ai/sdk/client.js` -- that retry reuses the
    same timeout budget, which is what turned one slow-but-fine response
    into two ~40s timeout windows back to back). But `maxRetries` is one
    knob covering that retry path *and* the SDK's separate retry for 429
    (rate limit) and 5xx (including Anthropic's documented "529
    overloaded" response -- a routine, expected condition under real API
    load, not a bug on our end) -- turning it off for the first case
    silently removed resilience against the second too. With every agent
    call one-and-done, a campaign making 20-30 of them (offering/ICP/
    signal + Contact/GTM per account) had real odds of *some* call hitting
    a transient 429/529, killing whichever stage or account it landed on
    -- consistent with campaigns failing "at some agent or another" rather
    than one consistent point. Fixed with a narrower, selective retry
    (`createWithSelectiveRetry`): retry exactly once, only for
    `RateLimitError`/`InternalServerError` (both return fast, with a real
    HTTP response -- retrying costs one short round trip, not a second
    full timeout window), honoring `retry-after` when present but capped
    at 3s so it can't itself blow the route's time budget; a connection
    timeout is still never retried, preserving the original fix. The
    step route's `maxDuration` was raised 45s -> 58s (just under Hobby's
    60s hard ceiling) to give this one retry room without claiming more of
    the platform ceiling than the realistic worst case needs.
  - Verified with real mocked-`fetch` request/response round trips, not
    just by reading the code (`src/lib/ai/anthropic-provider.test.ts`,
    new): a 429 with a `retry-after` header retries once and succeeds; a
    5xx with no header retries once (honoring the real ~1.5s default
    delay, not a shortcut) and succeeds; a 400 never retries; two
    consecutive 429s fail after exactly one retry, not indefinitely.
  - Not verified against a live Anthropic key or Postgres instance (same
    sandbox restriction noted everywhere else in this document) -- the
    next real campaign run, especially one with a large-enterprise ICP, is
    the actual end-to-end confirmation.

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
- Identity fields are filled in: company is Intrendz Media (currently
  unincorporated / sole proprietorship, based in India; SignalIQ is its
  proprietary product), governing law is India, and
  `contact@intrendzmedia.com` is the single contact address across both
  documents. The physical mailing address line was deliberately omitted
  rather than filled with a placeholder or a home address -- add it once
  there's a permanent registered office.
- Still open, and these are business/legal decisions, not just filling in
  facts: the refund policy (Terms §3), the liability clause itself (Terms
  §8, currently a common shape not a drafted clause), the AI provider's
  current data-retention/training-use terms to cite (Privacy §5), and
  confirming database encryption at rest/in transit once the production
  Postgres host is chosen (Privacy §7). Two numeric defaults were filled
  in as placeholders, not decisions -- adjust freely: 7 days' grace period
  before suspending on non-payment (Terms §3), 90 days' data retention
  after cancellation (Privacy §6).
- Both documents still need attorney review before a single real user sees
  them, per the warning at the top of each file -- filling in the
  placeholders makes them complete drafts, not reviewed legal documents.
  They're already linked from `/signup` and live at `/terms`/`/privacy`,
  so no code change is needed once the content is final, just edit the
  `.md` files.

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
- Password reset / "forgot password" -- there's no self-serve flow yet;
  handle it manually (reset via `db:seed`-style script, or a direct DB
  update) until this exists.

Real research providers (Tavily, SEC EDGAR) are built now -- see the
"Already built in this pass" sections above; USASpending.gov/SAM.gov and
real firmographic enrichment are the next signal sources in that same
direction, not yet built.
