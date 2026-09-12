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
} from "./schema";
import { eq, desc, inArray } from "drizzle-orm";

export async function getDashboardData(organizationId: string) {
  const orgCampaigns = await db.select().from(campaigns).where(eq(campaigns.organizationId, organizationId));
  const campaignIds = orgCampaigns.map((c) => c.id);
  if (campaignIds.length === 0) {
    return { campaigns: [], accounts: [], topAccounts: [], latestSignals: [], kpis: emptyKpis() };
  }

  const orgAccounts = await db.select().from(accounts).where(inArray(accounts.campaignId, campaignIds));
  const accountIds = orgAccounts.map((a) => a.id);
  const scores = accountIds.length
    ? await db.select().from(accountScores).where(inArray(accountScores.accountId, accountIds))
    : [];
  const scoreByAccount = new Map(scores.map((s) => [s.accountId, s]));

  const signals = accountIds.length
    ? await db.select().from(accountSignals).where(inArray(accountSignals.accountId, accountIds))
    : [];

  const contactRows = accountIds.length
    ? await db.select().from(contacts).where(inArray(contacts.accountId, accountIds))
    : [];

  const accountsWithScore = orgAccounts
    .map((a) => ({ ...a, score: scoreByAccount.get(a.id) ?? null }))
    .sort((a, b) => (b.score?.opportunity ?? 0) - (a.score?.opportunity ?? 0));

  const topAccounts = accountsWithScore.slice(0, 8);

  const latestSignals = [...signals]
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, 10)
    .map((s) => ({ ...s, account: orgAccounts.find((a) => a.id === s.accountId) }));

  const decisionMakersIdentified = contactRows.filter((c) => c.isVerified).length;
  const highPriority = accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 70).length;
  const activeIntent = accountsWithScore.filter((a) => (a.score?.intent ?? 0) >= 50).length;

  return {
    campaigns: orgCampaigns,
    accounts: accountsWithScore,
    topAccounts,
    latestSignals,
    kpis: {
      accountsAnalyzed: orgAccounts.length,
      icpMatches: accountsWithScore.filter((a) => (a.score?.icpFit ?? 0) >= 60).length,
      activeIntentAccounts: activeIntent,
      highPriorityAccounts: highPriority,
      decisionMakersIdentified,
      hot: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 75).length,
      warm: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) >= 50 && (a.score?.opportunity ?? 0) < 75).length,
      emerging: accountsWithScore.filter((a) => (a.score?.opportunity ?? 0) < 50).length,
    },
  };
}

function emptyKpis() {
  return {
    accountsAnalyzed: 0,
    icpMatches: 0,
    activeIntentAccounts: 0,
    highPriorityAccounts: 0,
    decisionMakersIdentified: 0,
    hot: 0,
    warm: 0,
    emerging: 0,
  };
}

export async function getCampaignDetail(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
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

  return {
    campaign,
    offeringDna: dna,
    personas,
    icp,
    signals,
    accounts: campaignAccounts
      .map((a) => ({ ...a, score: scoreByAccount.get(a.id) ?? null }))
      .sort((a, b) => (b.score?.opportunity ?? 0) - (a.score?.opportunity ?? 0)),
  };
}

export async function getAccountDetail(accountId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return null;
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
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, account.campaignId)).limit(1);

  return {
    account,
    campaign,
    score,
    signals: signals.map((s) => ({ ...s, source: sourceById.get(s.sourceId) ?? null })),
    contacts: accountContacts,
    outreach: outreach ?? null,
  };
}

export async function getAllSignals(organizationId: string) {
  const orgCampaigns = await db.select().from(campaigns).where(eq(campaigns.organizationId, organizationId));
  const campaignIds = orgCampaigns.map((c) => c.id);
  if (campaignIds.length === 0) return [];
  const orgAccounts = await db.select().from(accounts).where(inArray(accounts.campaignId, campaignIds));
  const accountIds = orgAccounts.map((a) => a.id);
  if (accountIds.length === 0) return [];
  const signals = await db.select().from(accountSignals).where(inArray(accountSignals.accountId, accountIds));
  return [...signals]
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .map((s) => ({ ...s, account: orgAccounts.find((a) => a.id === s.accountId) }));
}

export async function getAllContacts(organizationId: string) {
  const orgCampaigns = await db.select().from(campaigns).where(eq(campaigns.organizationId, organizationId));
  const campaignIds = orgCampaigns.map((c) => c.id);
  if (campaignIds.length === 0) return [];
  const orgAccounts = await db.select().from(accounts).where(inArray(accounts.campaignId, campaignIds));
  const accountIds = orgAccounts.map((a) => a.id);
  if (accountIds.length === 0) return [];
  const contactRows = await db.select().from(contacts).where(inArray(contacts.accountId, accountIds));
  return contactRows.map((c) => ({ ...c, account: orgAccounts.find((a) => a.id === c.accountId) }));
}
