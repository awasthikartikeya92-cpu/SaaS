# SignalIQ

AI-powered account intelligence platform: describe your offering, and the
agent pipeline builds an ICP, a signal taxonomy, a scored account universe,
and outreach recommendations from it. Originally scoped as a phased build
(see "What's stubbed" below for what's still Phase 2+); auth, billing,
and deploy infrastructure have since gone beyond that original Phase 1 scope
to make the app actually launchable, not just demoable.

## Quick start

Needs a real Postgres database (see "Database" below for the fastest way to
get one) and an Anthropic API key to actually run campaigns, then:

```bash
npm install
cp .env.example .env   # fill in your Postgres connection string + NEXTAUTH_SECRET
npm run db:push          # create the schema
npm run db:seed           # seed a demo org/user/campaign
npm run dev
```

Open http://localhost:3000 -- sign in with the seeded demo account, or use
**Sign up** to create a real account of your own (`/signup`):

```
demo@signaliq.dev / demo1234
```

The seeded campaign ("Ridgeline Ops Platform") has 6 mock accounts with full
scores, signals, evidence, a recommended persona, and an outreach angle, so
the whole UI is populated on first run -- no API key needed to look around.
(Re-running `db:seed` adds another demo org rather than replacing the first
-- it's an insert, not an upsert -- so run it once per fresh database.)

## Database

This runs on Postgres (Drizzle ORM). The fastest way to get one: Vercel
project → **Storage → Add → Prisma Postgres**. That injects three env vars
under whatever prefix you choose (default `STORAGE`):

- `{PREFIX}_POSTGRES_URL` -- pooled connection, used at runtime (`src/lib/db/index.ts`)
- `{PREFIX}_DATABASE_URL` -- direct connection, used for migrations (`drizzle.config.ts`)
- `{PREFIX}_PRISMA_DATABASE_URL` -- Accelerate connection, **not used** (would need Prisma's own client)

Using a different Postgres host (Supabase, self-hosted, etc.) instead? Just
set `DATABASE_URL` directly -- both `src/lib/db/index.ts` and
`drizzle.config.ts` fall back to it when the `STORAGE_*` vars aren't set.

## AI provider & model selection

```bash
# in .env
ANTHROPIC_API_KEY="sk-ant-..."
```

Set a monthly spend cap in the Anthropic Console before adding a real key
anywhere it can be triggered by outside traffic -- see `docs/launch-checklist.md`.

Not every agent call runs on the same model (`src/lib/ai/model-config.ts`):
Offering/ICP/Signal/GTM use the "strong" model (`claude-sonnet-5` by
default) since their output is either foundational (everything downstream
inherits it) or directly user-facing (the outreach content itself); Contact
uses the "fast" one (`claude-haiku-4-5-20251001`) since it's picking a job
title from known patterns and is never shown as-is to a prospect.
`ANTHROPIC_MODEL_STRONG` / `ANTHROPIC_MODEL_FAST` override either tier;
`ANTHROPIC_MODEL` alone still works as a full blanket override for every
agent if you want the old single-model behavior back.

Then "New campaign" -> fill in the offering -> the pipeline runs for real
(Research stays on mock data -- see below). Without a key, or with an
invalid one, the campaign fails cleanly: it moves to `failed` status and
the campaign page shows which agent failed and why, instead of sitting at
"generating" forever.

Generation itself runs as a resumable series of short steps
(`POST /api/campaigns/[id]/step`, `src/lib/agents/orchestrator.ts`) rather
than one long request -- the campaign page polls that endpoint and shows
live progress (which stage, how many accounts are done). This exists
because a free/Hobby Vercel plan hard-caps a serverless function at 60s
with no way to raise it, and this pipeline's several real LLM calls can
legitimately take longer than that combined; see
`docs/launch-checklist.md` for the full reasoning. A full campaign visibly
takes a few minutes as a result -- that's expected, not a hang.

## One deviation from the original spec -- and why

The brief specified **PostgreSQL + Prisma** and the **shadcn/ui CLI**. Both
were tried first while building Phase 1 in a network-restricted sandbox that
couldn't reach `binaries.prisma.sh` (Prisma's query-engine binary) or
`ui.shadcn.com` (the component registry). Rather than ship something that
didn't run:

- **Drizzle ORM + SQLite** stood in for Prisma + Postgres during Phase 1,
  then was replaced with **Drizzle ORM + Postgres** (`src/lib/db/schema.ts`,
  `src/lib/db/index.ts`) once a real Postgres instance was provisioned --
  same normalized schema throughout (mirrors the Prisma draft in the
  architecture doc table-for-table), Prisma's client/binary still isn't
  used anywhere.
- **Hand-built UI components** (`src/components/ui/*`) still replace the
  shadcn CLI output -- same Radix-primitives-plus-Tailwind pattern shadcn
  itself uses, just written directly instead of fetched.

## What's real vs. stubbed

**Real and working:**
- A real marketing landing page at `/` -- positioning, product preview built
  from the app's own real UI components, no fabricated social proof or
  pricing numbers. `/` now serves this to signed-out visitors instead of
  redirecting straight to `/login`.
- Auth (NextAuth, credentials + bcrypt), self-serve signup (`/signup`,
  rate-limited by IP -- see `docs/launch-checklist.md` on why that's a
  deterrent, not real abuse prevention), a real password reset flow
  (`/forgot-password`, `/reset-password` -- single-use, 1-hour-expiring
  tokens, rate-limited the same way signup is; see `src/lib/auth/password-reset.ts`),
  campaign creation, full DB schema
- Offering / ICP / Signal / Contact / GTM agents -- call Anthropic for real
  once you add a key, each on its own model tier, with Zod-validated
  structured output
- Verification agent -- deterministic evidence filtering (rejects anything
  without a source URL or with too little substance; never invents facts)
- Scoring engine -- pure, testable functions, the 40/40/20 formula from the
  brief, nothing AI-guessed
- Dashboard, campaign detail (Offering DNA / ICP / Signal Taxonomy tabs),
  full account intelligence page, global signal feed, contacts directory,
  report content generation
- A campaign that fails partway through becomes `failed`, not stuck at
  `generating` forever, and the campaign page shows the actual error

**Intentionally stubbed:**
- **Research defaults to mock data, but real providers exist and are one
  key away from live.** Set `TAVILY_API_KEY` (real web/news search) and/or
  `SEC_EDGAR_USER_AGENT` (free public-filings search) and they activate
  automatically -- no separate `RESEARCH_PROVIDER`/`SEC_EDGAR_ENABLED` flag
  needed anymore, since providing the credential already says what you
  want. See `src/lib/research/`.
- **Contact Agent recommends a title by default; real verified people are
  available too, from up to three composable sources.** There's still no
  person-level enrichment *unless* configured: a free company-team-page
  scrape (`CONTACT_TEAM_PAGE_ENABLED`), a free-tier Google-search-snippet
  OSINT lookup (`GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_CX`), and Hunter's
  commercial domain search (`HUNTER_API_KEY`) all compose -- what one
  misses another can catch -- and are all tried before ever falling back
  to the LLM's recommended title. The "never invent a contact" rule holds
  exactly as before across all three: a verified name only ever comes from
  one of these deterministic lookups, never from the LLM. See
  `src/lib/contacts/`.
- **PDF/DOCX/CSV export buttons are present but disabled.** Report
  *content* generation works now (`/reports`); file export doesn't yet.
- **Scoring weights are read-only** in Settings -- the formula already
  reads from a config object (`src/lib/scoring/index.ts`), not inline
  literals, so making them configurable later is a settings change, not a
  refactor.
- **Password reset emails need a real provider to actually reach anyone.**
  The flow itself is complete and works end-to-end; without
  `RESEND_API_KEY` set, "sending" a reset email just logs it to the
  server's own logs instead of delivering it (`src/lib/email/`) -- real
  for local dev/testing a fresh signup's password reset yourself, not a
  working delivery mechanism for a real user until that key is set.

**Billing/growth infrastructure:**
- **AI usage instrumentation** -- every Anthropic call is logged (exact
  token counts, per org/campaign/agent) to `ai_usage_events`, so real
  cost-per-campaign is measurable instead of guessed. See
  `src/lib/ai/usage-context.ts` and `src/lib/billing/usage-tracking.ts`.
- **Free-tier quota enforcement** -- campaign creation is capped per org per
  calendar month (`src/lib/billing/plans.ts` / `quota.ts`; default 3,
  `FREE_PLAN_CAMPAIGNS_PER_MONTH` env-overridable), returning HTTP 402 with
  the current usage when exceeded.
- **Stripe billing scaffolding** (`/api/billing/checkout`, `/api/billing/webhook`)
  -- dormant (returns 501) until `STRIPE_SECRET_KEY` is set, so this ships
  without forcing a Stripe account today.
- **Product analytics, wired to PostHog** (`src/lib/analytics/track.ts`) --
  posts directly to PostHog's HTTP capture API (no SDK dependency) once
  `POSTHOG_KEY` is set; no-ops until then. Call sites cover signup, campaign
  create/delete, generation succeeded/failed, quota blocks, and the billing
  funnel (checkout started, subscription activated/canceled).
- **Plan & usage in Settings** -- current plan, this month's real AI
  token/cost usage per agent, and an Upgrade button per priced plan.
- **Legal drafts** (`legal/terms.md`, `legal/privacy.md`) -- founder-drafted
  starting points, explicitly marked as needing attorney review, live at
  `/terms` and `/privacy` and linked from `/signup`.

See `docs/launch-checklist.md` for exactly what's left as a manual,
human-only step (your own Anthropic key + a spend cap in the Anthropic
Console, filling in real pricing once usage data exists, a Stripe account,
legal review, real signup-abuse prevention beyond the current IP throttle,
a real research provider).

## Useful commands

```bash
npm run dev          # local dev server
npm run build         # production build (verified clean, no TS errors)
npm test               # vitest -- the deterministic core (scoring, JSON parsing,
                        # verification, the resumable-pipeline state machine's
                        # decision logic); see "What's tested" below
npm run db:generate    # generate migration SQL from schema.ts (no live DB needed)
npm run db:push         # push schema.ts to the Postgres DB in DATABASE_URL/STORAGE_DATABASE_URL
npm run db:seed          # seed a demo org/user/campaign (insert, not upsert -- see "Quick start")
```

`.github/workflows/ci.yml` runs typecheck, lint, `npm test`, and a full
build on every push/PR -- there was no CI at all before this pass.

There's deliberately no `db:reset`/wipe script -- that made sense against a
disposable local SQLite file in Phase 1, but a "drop and reseed" command is
one wrong terminal away from wiping a real shared Postgres database once
users exist. Reset a dev/staging database by hand when you actually mean to.

`package.json` also has a `vercel-build` script Vercel uses instead of
`build` automatically -- it force-pushes the schema and (best-effort)
reseeds before building, because the environment this was built in
couldn't reach Postgres directly to run those by hand. Remove it once
you've confirmed a deploy works end to end; see `docs/launch-checklist.md`
item 0 for why it shouldn't stay wired into every deploy long-term.

## Project layout

```
src/lib/ai/          -- provider interface + per-agent model selection (Anthropic default, OpenAI stub)
src/lib/research/    -- Research provider interface (mock by default; real Tavily/SEC EDGAR auto-detected from credentials)
src/lib/contacts/    -- Contact enrichment: team-page scrape (free), Google-search OSINT (free tier), Hunter.io (commercial) -- all opt-in, composable
src/lib/email/        -- Email provider interface (console log by default; real delivery via Resend)
src/lib/agents/      -- one file per agent + orchestrator.ts
src/lib/scoring/      -- deterministic scoring engine
src/lib/billing/       -- plans, quota enforcement, usage tracking, Stripe, pricing config
src/lib/auth/           -- signup + password-reset rate limiting, password-reset token logic
src/lib/analytics/       -- product analytics seam
src/lib/db/               -- Drizzle schema, client, query helpers
legal/                      -- Terms/Privacy source, rendered at /terms and /privacy
src/app/(dashboard)/          -- Overview (campaign picker), Campaigns (each with its own Overview/Accounts/Contacts/Signals/Offering DNA/ICP/Signal Taxonomy tabs), Reports, Settings
src/app/api/                    -- campaigns, agent-pipeline trigger, reports, auth, billing
```

## What's tested

`npm test` (vitest) covers the pure, deterministic core -- deliberately not
anything needing a live Postgres connection (unreachable from the sandbox
this was built in, same restriction noted throughout this codebase):

- `src/lib/scoring/` -- every scoring function, including regression tests
  for three real bugs a full product audit found and fixed here (icpFit
  frozen at 71.3 for every account, reachability discarding
  `contactConfidence` entirely, intent double-counting confidence under two
  field names) -- see `docs/launch-checklist.md`.
- `src/lib/agents/schemas.ts` -- `parseJson`'s balanced-brace JSON
  extraction (code fences, leading/trailing prose, braces inside string
  values) and the defensive Zod primitives (0-100 -> 0-1 confidence
  coercion, graceful degradation on a wrong-shaped field).
- `src/lib/agents/verification-agent.ts` -- the deterministic evidence
  filter (source URL + excerpt length required) and confidence assignment.
- `src/lib/agents/stage-decision.ts` -- the resumable pipeline's core
  decision (done / in-flight / not-started), pulled out of
  `orchestrator.ts` specifically so it's testable without a live DB
  connection; this is what prevents two overlapping step calls from both
  trying to create the same campaign's offering/ICP/signal-taxonomy row.
- `src/lib/ai/anthropic-provider.ts` -- the selective-retry logic (retries
  a fast-failing 429/5xx once, never a connection timeout) against real
  mocked HTTP request/response round trips.
- `src/lib/research/index.ts` -- the provider auto-detection logic (infers
  a real provider from credentials alone, an explicit env var still wins).
- `src/lib/contacts/rank.ts` -- which real enrichment candidate, if any, is
  confident and relevant enough to surface as a verified contact.
- `src/lib/contacts/team-page-provider.ts` -- the team-page link-scoring
  heuristic and readable-text extraction (script/style/nav/footer
  stripped, whitespace collapsed, long pages truncated).
- `src/lib/contacts/google-search-provider.ts` -- parsing LinkedIn's own
  search-result title format into name+title, including the cases it
  correctly declines to guess at (no title segment present).
- `src/lib/auth/password-reset.ts` -- token generation/hashing/validity.

## Verified

- `npm run build` -- clean, no TypeScript errors, no warnings
- `npm test` -- 81 tests passing across the files above and more
- Full login -> dashboard -> campaign -> account-detail flow smoke-tested
  against seeded data with a production server, every page returns 200 with
  real content (not an error page)
- Campaign creation API verified end-to-end (DB write confirmed), including
  the free-tier quota check (blocks with HTTP 402 at the monthly cap)
- Postgres migration SQL generated and typechecked against `schema.ts`
  (22 tables, now with foreign keys and indexes throughout -- see
  `docs/launch-checklist.md`)
- Deployed to Vercel against a live Prisma Postgres database: signup,
  login, and campaign creation confirmed working in production

Not yet confirmed: a full agent-pipeline run completing successfully
end-to-end in production (needs a valid `ANTHROPIC_API_KEY` in place, which
depends on your own Anthropic account) -- see `docs/launch-checklist.md`.

## Next steps

See `docs/launch-checklist.md` for the full, current list. The two biggest
remaining pieces:

1. **More research signal sources.** `RESEARCH_PROVIDER=tavily` is wired up
   (`src/lib/research/tavily-provider.ts`) but unverified against Tavily's
   live API from this environment -- see `docs/launch-checklist.md`. SEC
   EDGAR full-text search is now built alongside it as an additive source
   (`SEC_EDGAR_ENABLED=true`, `src/lib/research/sec-edgar-provider.ts`) --
   public companies only, but a small vendor's own ICP is very often large
   public enterprises even when the vendor itself is an SMB. Still worth
   layering in: public ATS job-board APIs (Greenhouse/Lever, no key needed
   -- strong, legally clean hiring-signal source), USASpending.gov/SAM.gov
   federal contract-award data (the closest free equivalent to SEC filings
   for *private* companies), and a firmographics source to replace the
   neutral midpoint values `orchestrator.ts` currently uses for geography/
   size/tech sub-scores when evidence doesn't supply them.
2. **Everything in `docs/launch-checklist.md`'s "manual step" section** --
   real pricing once usage data exists, a Stripe account, legal review, and
   real signup-abuse prevention beyond the current IP throttle.
