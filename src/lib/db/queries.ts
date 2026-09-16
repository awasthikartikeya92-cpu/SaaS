import { db } from "./index";
import {
  campaigns,
  accounts,
  accountScores,
  accountSignals,
  contacts,
  outreachRecommendations,
  offeringDna,
  buyerPersonas,
  icpProfiles,
  signalTaxonomies,
  signalDefinitions,
  researchSources,
  researchRuns,
  reports,
} from "./schema";
import { eq, desc, inArray, and } from "drizzle-orm";

/**
 * The single source of truth for "does this campaign belong to this org."
 * Every function below that takes a campaignId (or an id that resolves to
 * one, like an account or report) goes through this -- filtering by
 * organizationId in the SQL WHERE clause itself, not as a check applied
 * after the row is already in memory. That matters: a post-hoc check is
 * one `if` a future call site can forget to add (see docs/launch-checklist.md
 * for the audit that found exactly that, four times, across the detail
 * pages and the generate-step route); requiring organizationId as a
 * parameter here makes the caller's organizationId part of the query
 * itself, so there's no code path that can return another org's row
 * without deliberately bypassing this function entirely.
 */
export async function getOwnedCampaign(campaignId: string, organizationId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return campaign ?? null;
}

export interface AccountKpis {
  accountsAnalyzed: number;
  accountsWithVerifiedSignal: number;
  activeIntentAccounts: number;
  highPriorityAccounts: number;
  decisionMakersIdentified: number;
  hot: number;
  warm: number;
  emerging: number;
}

type AccountWithScore = typeof accounts.$inferSelect & { score: typeof accountScores.$inferSelect | null };

/**
 * The KPI formula itself -- pulled out so it's computed identically
 * whether it's being applied across one campaign's accounts
 * (getCampaignAnalytics) or run once per campaign over a shared fetch
 * (getCampaignSummaries). Previously this only ever ran once, blended
 * across every campaign in the org on a single /overview page -- which
 * read as meaningful comparison ("12 hot accounts") when the accounts
 * being compared belonged to entirely different offerings and ICPs with
 * their own scoring context. A "hot" account in one campaign isn't
 * commensurable with a "hot" account in another; blending them into one
 * number was the actual bug, not a UI problem. See
 * docs/launch-checklist.md for the redesign this came from.
 */
function computeAccountKpis(accountsWithScore: AccountWithScore[], signals: (typeof accountSignals.$inferSelect)[], contactRows: (typeof contacts.$inferSelect)[]): AccountKpis {
  const decisionMakersIdentified = contactRows.filter((c) => c.isVerified).length;
  // Was `opportunity >= 70` / `>= 75` / `< 50`, chosen back when icpFit
  // ranged 45-90 (in practice always landing on 71.3 -- see
  // src/lib/scoring/index.ts). icpFit is now an honestly-labeled flat 65
  // placeholder until real firmographic data exists to genuinely
  // differentiate accounts on it, which narrowed the achievable opportunity
  // range to roughly 54-73 (intent and reachability now do all the real
  // differentiating -- see computeReachability/computeRoleRelevance).
  // Recalibrated so all three tiers are actually reachable against that
  // real range instead of two of them sitting above the achievable
  // ceiling. Revisit these numbers once firmographic enrichment ships and
  // icpFit varies for real -- they're a judgment call against today's
  // distribution, the same as the original numbers were, not a derived
  // constant.
  const highPriority = accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 62).length;
  const activeIntent = accountsWithScore.filter((a) => (a.score?.intent ?? 0) >= 50).length;
  // "ICP matches" used to filter on icpFit >= 60 -- with icpFit currently a
  // flat 65 for every account (see above), that filter is tautologically
  // true for 100% of accounts, which is worse than uninformative: it reads
  // as real ICP filtering when none is happening. Swapped to something
  // that's actually real today -- accounts with at least one signal the
  // Verification Agent could independently date and verify, reusing
  // `signals` already fetched above rather than a new query.
  const verifiedAccountIds = new Set(signals.filter((s) => s.verified).map((s) => s.accountId));
  const accountsWithVerifiedSignal = accountsWithScore.filter((a) => verifiedAccountIds.has(a.id)).length;

  return {
    accountsAnalyzed: accountsWithScore.length,
    accountsWithVerifiedSignal,
    activeIntentAccounts: activeIntent,
    highPriorityAccounts: highPriority,
    decisionMakersIdentified,
    hot: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 68).length,
    warm: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 55 && (a.score?.opportunity ?? 0) < 68).length,
    emerging: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) < 55).length,
  };
}

function emptyKpis(): AccountKpis {
  return {
    accountsAnalyzed: 0,
    accountsWithVerifiedSignal: 0,
    activeIntentAccounts: 0,
    highPriorityAccounts: 0,
    decisionMakersIdentified: 0,
    hot: 0,
    warm: 0,
    emerging: 0,
  };
}

/**
 * One row per campaign for the /overview picker -- each campaign's own
 * KPIs, never blended with any other campaign's. One shared fetch across
 * every account/signal/contact in the org (not a query per campaign in a
 * loop), then partitioned in memory by campaignId -- the same number of
 * round trips as the old org-wide getDashboardData, just grouped
 * differently before it's returned.
 */
export async function getCampaignSummaries(organizationId: string) {
  const orgCampaigns = await db.select().from(campaigns).where(eq(campaigns.organizationId, organizationId)).orderBy(desc(campaigns.createdAt));
  if (orgCampaigns.length === 0) return [];

  const campaignIds = orgCampaigns.map((c) => c.id);
  const orgAccounts = await db.select().from(accounts).where(inArray(accounts.campaignId, campaignIds));
  const accountIds = orgAccounts.map((a) => a.id);
  const scores = accountIds.length ? await db.select().from(accountScores).where(inArray(accountScores.accountId, accountIds)) : [];
  const scoreByAccount = new Map(scores.map((s) => [s.accountId, s]));
  const signals = accountIds.length ? await db.select().from(accountSignals).where(inArray(accountSignals.accountId, accountIds)) : [];
  const contactRows = accountIds.length ? await db.select().from(contacts).where(inArray(contacts.accountId, accountIds)) : [];

  return orgCampaigns.map((campaign) => {
    const campaignAccounts: AccountWithScore[] = orgAccounts
      .filter((a) => a.campaignId === campaign.id)
      .map((a) => ({ ...a, score: scoreByAccount.get(a.id) ?? null }));
    const campaignAccountIds = new Set(campaignAccounts.map((a) => a.id));
    const campaignSignals = signals.filter((s) => campaignAccountIds.has(s.accountId));
    const campaignContacts = contactRows.filter((c) => campaignAccountIds.has(c.accountId));
    return {
      campaign,
      kpis: campaignAccounts.length ? computeAccountKpis(campaignAccounts, campaignSignals, campaignContacts) : emptyKpis(),
    };
  });
}

/** The KPI/top-accounts view for a single campaign's own dashboard -- same formula as getCampaignSummaries, scoped to just this campaign. Null when the campaign doesn't exist or isn't this org's. */
export async function getCampaignAnalytics(campaignId: string, organizationId: string) {
  const campaign = await getOwnedCampaign(campaignId, organizationId);
  if (!campaign) return null;

  const campaignAccounts = await db.select().from(accounts).where(eq(accounts.campaignId, campaignId));
  const accountIds = campaignAccounts.map((a) => a.id);
  const scores = accountIds.length ? await db.select().from(accountScores).where(inArray(accountScores.accountId, accountIds)) : [];
  const scoreByAccount = new Map(scores.map((s) => [s.accountId, s]));
  const accountsWithScore: AccountWithScore[] = campaignAccounts.map((a) => ({ ...a, score: scoreByAccount.get(a.id) ?? null }));
  const signals = accountIds.length ? await db.select().from(accountSignals).where(inArray(accountSignals.accountId, accountIds)) : [];
  const contactRows = accountIds.length ? await db.select().from(contacts).where(inArray(contacts.accountId, accountIds)) : [];

  const topAccounts = [...accountsWithScore].sort((a, b) => (b.score?.opportunity ?? 0) - (a.score?.opportunity ?? 0)).slice(0, 8);

  return {
    kpis: accountsWithScore.length ? computeAccountKpis(accountsWithScore, signals, contactRows) : emptyKpis(),
    topAccounts,
  };
}

export async function getCampaignDetail(campaignId: string, organizationId: string) {
  const campaign = await getOwnedCampaign(campaignId, organizationId);
  if (!campaign) return null;

  const [dna] = await db.select().from(offeringDna).where(eq(offeringDna.campaignId, campaignId)).limit(1);
  const personas = dna ? await db.select().from(buyerPersonas).where(eq(buyerPersonas.offeringDnaId, dna.id)) : [];
  const [icp] = await db.select().from(icpProfiles).where(eq(icpProfiles.campaignId, campaignId)).limit(1);
  const [taxonomy] = await db.select().from(signalTaxonomies).where(eq(signalTaxonomies.campaignId, campaignId)).limit(1);
  const signals = taxonomy ? await db.select().from(signalDefinitions).where(eq(signalDefinitions.taxonomyId, taxonomy.id)) : [];
  const campaignAccounts = await db.select().from(accounts).where(eq(accounts.campaignId, campaignId));
  const scores = campaignAccounts.length
    ? await db.select().from(accountScores).where(inArray(accountScores.accountId, campaignAccounts.map((a) => a.id)))
    : [];
  const scoreByAccount = new Map(scores.map((s) => [s.accountId, s]));

  // Most recent pipeline run, if any -- lets the UI show which agent failed
  // and why, for both a properly "failed" campaign (orchestrator.ts's own
  // catch block) and a legacy campaign stuck at "generating" from before
  // that existed (see campaigns/[id]/page.tsx).
  const [failedRun] =
    campaign.status === "generating" || campaign.status === "failed"
      ? await db
          .select()
          .from(researchRuns)
          .where(eq(researchRuns.campaignId, campaignId))
          .orderBy(desc(researchRuns.startedAt))
          .limit(1)
      : [];

  return {
    campaign,
    offeringDna: dna,
    personas,
    icp,
    signals,
    accounts: campaignAccounts
      .map((a) => ({ ...a, score: scoreByAccount.get(a.id) ?? null }))
      .sort((a, b) => (b.score?.opportunity ?? 0) - (a.score?.opportunity ?? 0)),
    latestRun: failedRun ?? null,
  };
}

// Read-only summary of where a campaign's resumable generation is, without
// doing any work itself -- used both for the campaign page's first
// server-rendered paint (so there's no blank flash before the client's
// first poll response) and, with the same shape, by
// POST /api/campaigns/[id]/step after it performs one unit of work. Derived
// entirely from persisted state (research_runs + accounts.status), never
// from anything held in memory -- so it's correct even on a fresh page load
// of a campaign someone else's browser tab has been driving.
export type GenerationStage = "offering" | "icp" | "signal" | "research" | "accounts" | "complete";

export interface GenerationProgress {
  campaignStatus: string;
  stage: GenerationStage;
  stages: Record<"offering" | "icp" | "signal" | "research", "pending" | "running" | "success" | "error">;
  accountsTotal: number;
  accountsDone: number; // status "done" or "failed" -- i.e. no longer queued
  failedAccounts: { companyName: string; reason: string | null }[];
  lastError: string | null;
}

export async function getGenerationProgress(
  campaignId: string,
  organizationId: string
): Promise<GenerationProgress | null> {
  const campaign = await getOwnedCampaign(campaignId, organizationId);
  if (!campaign) return null;

  const runs = await db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.campaignId, campaignId))
    .orderBy(desc(researchRuns.startedAt));

  // `runs` is newest-first, so the first row seen per agent name is that
  // agent's most recent attempt -- relevant for offering/icp/signal/research,
  // which (unlike accounts) never retry within a campaign today, but this
  // stays correct if that ever changes.
  const latestByAgent = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latestByAgent.has(r.agent)) latestByAgent.set(r.agent, r);
  type RunStatus = "pending" | "running" | "success" | "error";
  const stageStatus = (agent: string): RunStatus => {
    const status = latestByAgent.get(agent)?.status;
    return status === "running" || status === "success" || status === "error" ? status : "pending";
  };

  const campaignAccounts = await db.select().from(accounts).where(eq(accounts.campaignId, campaignId));
  const accountsTotal = campaignAccounts.length;
  const accountsDone = campaignAccounts.filter((a) => a.status === "done" || a.status === "failed").length;
  const failedAccounts = campaignAccounts
    .filter((a) => a.status === "failed")
    .map((a) => ({ companyName: a.companyName, reason: a.failureReason }));

  const stages = {
    offering: stageStatus("offering-agent"),
    icp: stageStatus("icp-agent"),
    signal: stageStatus("signal-agent"),
    research: stageStatus("research-agent"),
  };

  let stage: GenerationStage;
  if (stages.offering !== "success") stage = "offering";
  else if (stages.icp !== "success") stage = "icp";
  else if (stages.signal !== "success") stage = "signal";
  else if (stages.research !== "success") stage = "research";
  else if (accountsDone < accountsTotal) stage = "accounts";
  else stage = "complete";

  return {
    campaignStatus: campaign.status,
    stage,
    stages,
    accountsTotal,
    accountsDone,
    failedAccounts,
    lastError: runs.find((r) => r.status === "error")?.error ?? null,
  };
}

export async function getAccountDetail(accountId: string, organizationId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return null;
  // Accounts don't carry organizationId directly (only campaignId) -- an
  // account belongs to an org transitively, through its campaign. Checking
  // here, before any of the account's own data is assembled below, is what
  // stops one org's accounts from being readable by another (see
  // getOwnedCampaign's comment for why this is a required parameter, not a
  // caller-side check).
  const campaign = await getOwnedCampaign(account.campaignId, organizationId);
  if (!campaign) return null;

  const [score] = await db.select().from(accountScores).where(eq(accountScores.accountId, accountId)).limit(1);
  const signals = await db.select().from(accountSignals).where(eq(accountSignals.accountId, accountId));
  const sourceIds = signals.map((s) => s.sourceId);
  const sources = sourceIds.length
    ? await db.select().from(researchSources).where(inArray(researchSources.id, sourceIds))
    : [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const accountContacts = await db.select().from(contacts).where(eq(contacts.accountId, accountId));
  const [outreach] = await db
    .select()
    .from(outreachRecommendations)
    .where(eq(outreachRecommendations.accountId, accountId))
    .orderBy(desc(outreachRecommendations.generatedAt))
    .limit(1);

  return {
    account,
    campaign,
    score,
    signals: signals.map((s) => ({ ...s, source: sourceById.get(s.sourceId) ?? null })),
    contacts: accountContacts,
    outreach: outreach ?? null,
  };
}

/**
 * Same transitive-ownership pattern as getAccountDetail: a report only
 * carries campaignId, not organizationId, so ownership is checked through
 * its parent campaign. Returns both, since every current caller needs the
 * campaign too (its name, for the report header).
 */
export async function getOwnedReport(reportId: string, organizationId: string) {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) return null;
  const campaign = await getOwnedCampaign(report.campaignId, organizationId);
  if (!campaign) return null;
  return { report, campaign };
}

/** Chronological signal feed for one campaign -- same shape as the old org-wide getAllSignals, scoped down. Null when the campaign doesn't exist or isn't this org's. */
export async function getCampaignSignals(campaignId: string, organizationId: string) {
  const campaign = await getOwnedCampaign(campaignId, organizationId);
  if (!campaign) return null;

  const campaignAccounts = await db.select().from(accounts).where(eq(accounts.campaignId, campaignId));
  const accountIds = campaignAccounts.map((a) => a.id);
  if (accountIds.length === 0) return [];
  const signals = await db.select().from(accountSignals).where(inArray(accountSignals.accountId, accountIds));
  return [...signals]
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .map((s) => ({ ...s, account: campaignAccounts.find((a) => a.id === s.accountId) }));
}

/** Every contact for one campaign's accounts -- same shape as the old org-wide getAllContacts, scoped down. Null when the campaign doesn't exist or isn't this org's. */
export async function getCampaignContacts(campaignId: string, organizationId: string) {
  const campaign = await getOwnedCampaign(campaignId, organizationId);
  if (!campaign) return null;

  const campaignAccounts = await db.select().from(accounts).where(eq(accounts.campaignId, campaignId));
  const accountIds = campaignAccounts.map((a) => a.id);
  if (accountIds.length === 0) return [];
  const contactRows = await db.select().from(contacts).where(inArray(contacts.accountId, accountIds));
  return contactRows.map((c) => ({ ...c, account: campaignAccounts.find((a) => a.id === c.accountId) }));
}
