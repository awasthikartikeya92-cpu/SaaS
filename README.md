# SignalIQ — Phase 1

AI-powered account intelligence platform. This is Phase 1 per the architecture
plan: app shell, auth, campaign creation, Offering/ICP/Signal agents, mock
research data, dashboard, account page, and the scoring engine.

## Quick start

Needs a real Postgres database (see "Database" below for the fastest way to
get one), then:

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

**To create a NEW campaign and actually run the agent pipeline**, you need an
Anthropic API key:

```bash
# in .env
ANTHROPIC_API_KEY="sk-ant-..."
```

Then "New campaign" -> fill in the offering -> the Offering, ICP, Signal,
Contact, and GTM agents run for real (Research stays on mock data -- see
below). Without a key, campaign creation still works but the generate step
will log an error to that campaign's research runs and the campaign stays in
"generating" status.

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

## What's real vs. stubbed in Phase 1

**Real and working:**
- Auth (NextAuth, credentials + bcrypt), self-serve signup (`/signup`,
  rate-limited by IP), campaign creation, full DB schema
- Offering / ICP / Signal / Contact / GTM agents -- call Anthropic for real
  once you add a key, with Zod-validated structured output
- Verification agent -- deterministic evidence filtering (rejects anything
  without a source URL or with too little substance; never invents facts)
- Scoring engine -- pure, testable functions, the 40/40/20 formula from the
  brief, nothing AI-guessed
- Dashboard, campaign detail (Offering DNA / ICP / Signal Taxonomy tabs),
  full account intelligence page, global signal feed, contacts directory,
  report content generation

**Intentionally stubbed (per the phase plan in the architecture doc):**
- **Research provider is mock data** (`src/lib/research/mock-provider.ts`).
  Phase 2 swaps in a real provider (Tavily/Exa/Serper) behind the same
  `ResearchProvider` interface -- nothing above that layer changes.
- **Contact Agent never returns a verified person** in Phase 1, by design --
  there's no person-level enrichment source yet, so it always recommends a
  job title instead, which is the "never invent a contact" rule from the
  brief working as intended, not a bug.
- **PDF/DOCX/CSV export buttons are present but disabled** (Phase 3). Report
  *content* generation works now (`/reports`); file export doesn't yet.
- **Scoring weights are read-only** in Settings (Phase 4 makes them
  configurable -- the formula already reads from a config object, not
  inline literals, so that's a settings change later, not a refactor).

**Billing/growth infrastructure, added ahead of a real launch:**
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
- **Product analytics seam** (`src/lib/analytics/track.ts`) -- no-ops until
  `POSTHOG_KEY` is set; call sites already exist at the events that matter
  for activation/retention tracking.
- **Plan & usage in Settings** -- current plan, this month's real AI
  token/cost usage per agent, and an Upgrade button per priced plan.
- **Legal drafts** (`legal/terms.md`, `legal/privacy.md`) -- founder-drafted
  starting points, explicitly marked as needing attorney review, live at
  `/terms` and `/privacy` and linked from `/signup`.

See `docs/launch-checklist.md` for exactly what's left as a manual,
human-only step (your own Anthropic key + a spend cap in the Anthropic
Console, filling in real pricing once usage data exists, a Stripe account,
legal review, real signup-abuse prevention beyond the current IP throttle).

## Useful commands

```bash
npm run dev          # local dev server
npm run build         # production build (verified clean, no TS errors)
npm run db:generate    # generate migration SQL from schema.ts (no live DB needed)
npm run db:push         # push schema.ts to the Postgres DB in DATABASE_URL/STORAGE_DATABASE_URL
npm run db:seed          # seed a demo org/user/campaign (insert, not upsert -- see "Quick start")
```

There's deliberately no `db:reset`/wipe script -- that made sense against a
disposable local SQLite file in Phase 1, but a "drop and reseed" command is
one wrong terminal away from wiping a real shared Postgres database once
users exist. Reset a dev/staging database by hand when you actually mean to.

## Project layout

```
src/lib/ai/          -- AI provider interface (Anthropic default, OpenAI stub)
src/lib/research/    -- Research provider interface (mock now, real in Phase 2)
src/lib/agents/      -- one file per agent + orchestrator.ts
src/lib/scoring/      -- deterministic scoring engine
src/lib/db/            -- Drizzle schema, client, query helpers
src/app/(dashboard)/    -- Overview, Campaigns, Accounts, Signals, Contacts, Reports, Settings
src/app/api/              -- campaign creation, agent-pipeline trigger, report generation
```

## Verified

- `npm run build` -- clean, no TypeScript errors, no warnings
- Full login -> dashboard -> campaign -> account-detail flow smoke-tested
  against seeded data with a production server, every page returns 200 with
  real content (not an error page)
- Campaign creation API verified end-to-end (DB write confirmed), including
  the free-tier quota check (blocks with HTTP 402 at the monthly cap)
- Postgres migration SQL generated and typechecked against `schema.ts`
  (21 tables) -- see `docs/launch-checklist.md` for what's been run against
  a live database vs. what's still pending your credentials

## Next steps (Phase 2 candidates)

1. Pick a real research provider (Tavily is the simplest to wire up) and
   implement it against `ResearchProvider` in `src/lib/research/`.
2. Add firmographic enrichment so ICP-fit sub-scores (geography, size, tech
   environment) aren't defaulted -- right now Phase 1 uses neutral midpoint
   values for those where mock data doesn't supply them (see the comments in
   `orchestrator.ts`).
