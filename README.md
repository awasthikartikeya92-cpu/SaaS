# SignalIQ — Phase 1

AI-powered account intelligence platform. This is Phase 1 per the architecture
plan: app shell, auth, campaign creation, Offering/ICP/Signal agents, mock
research data, dashboard, account page, and the scoring engine.

## Quick start

```bash
npm install
cp .env.example .env   # already done for you -- dev.db + a demo login are included
npm run dev
```

Open http://localhost:3000 and sign in with the seeded demo account:

```
demo@signaliq.dev / demo1234
```

The seeded campaign ("Ridgeline Ops Platform") has 6 mock accounts with full
scores, signals, evidence, a recommended persona, and an outreach angle, so
the whole UI is populated on first run -- no API key needed to look around.

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

## Two deviations from the original spec -- and why

The brief specified **PostgreSQL + Prisma** and the **shadcn/ui CLI**. Both
were tried first; both need to reach hosts this sandbox's network policy
blocks (`binaries.prisma.sh` for Prisma's query-engine binary, `ui.shadcn.com`
for the component registry). Rather than ship something that doesn't run:

- **Drizzle ORM + SQLite** replaces Prisma + Postgres for Phase 1. Same
  normalized schema (see `src/lib/db/schema.ts` -- it mirrors the Prisma draft
  in the architecture doc table-for-table). Moving to Postgres in production
  is a driver swap (`drizzle-orm/node-postgres` or `/postgres-js`), not a
  rewrite -- the table/column shape carries over directly.
- **Hand-built UI components** (`src/components/ui/*`) replace the shadcn CLI
  output -- same Radix-primitives-plus-Tailwind pattern shadcn itself uses,
  just written directly instead of fetched.

If you're running this outside a network-restricted sandbox, swapping back to
real Prisma + Postgres is a reasonable next step and the schema is already
laid out for it in the architecture doc.

## What's real vs. stubbed in Phase 1

**Real and working:**
- Auth (NextAuth, credentials + bcrypt), campaign creation, full DB schema
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
- **Production Postgres schema** (`src/lib/db/schema.postgres.ts`) -- mirrors
  the SQLite schema table-for-table; typechecked and migration-SQL
  generated, not yet run against a live database. Switch instructions are
  at the top of that file.
- **Legal drafts** (`legal/terms.md`, `legal/privacy.md`) -- founder-drafted
  starting points, explicitly marked as needing attorney review.

See `docs/launch-checklist.md` for exactly what's left as a manual,
human-only step (provisioning Postgres, your own Anthropic key + a spend
cap in the Anthropic Console, filling in real pricing once usage data
exists, a Stripe account, legal review).

## Useful commands

```bash
npm run dev          # local dev server
npm run build         # production build (verified clean, no TS errors)
npm run db:push        # push schema.ts changes to the SQLite DB
npm run db:seed         # re-seed the demo campaign
npm run db:reset          # wipe + push + seed in one step
npm run db:generate:postgres  # generate migration SQL from schema.postgres.ts (no live DB needed)
npm run db:push:postgres      # push schema.postgres.ts to a real Postgres DATABASE_URL
```

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
  against the seeded data with a production server, every page returns 200
  with real content (not an error page)
- Campaign creation API verified end-to-end (DB write confirmed)

## Next steps (Phase 2 candidates)

1. Pick a real research provider (Tavily is the simplest to wire up) and
   implement it against `ResearchProvider` in `src/lib/research/`.
2. Add firmographic enrichment so ICP-fit sub-scores (geography, size, tech
   environment) aren't defaulted -- right now Phase 1 uses neutral midpoint
   values for those where mock data doesn't supply them (see the comments in
   `orchestrator.ts`).
3. Move to Postgres once you're off a network-restricted sandbox.
