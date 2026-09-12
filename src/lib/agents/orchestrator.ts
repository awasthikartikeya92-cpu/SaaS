import { db } from "@/lib/db";
import {
  campaigns,
  offeringDna as offeringDnaTable,
  buyerPersonas,
  icpProfiles,
  signalTaxonomies,
  signalDefinitions,
  accounts,
  accountScores,
  accountSignals,
  contacts,
  outreachRecommendations,
  researchRuns,
  researchSources,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { runOfferingAgent } from "./offering-agent";
import { runIcpAgent } from "./icp-agent";
import { runSignalAgent } from "./signal-agent";
import { runResearchAgent } from "./research-agent";
import { runVerificationAgent, type VerifiedSignal } from "./verification-agent";
import { runContactAgent } from "./contact-agent";
import { runGtmAgent } from "./gtm-agent";
import { computeIcpFit, computeIntent, computeReachability, computeOpportunityScore } from "@/lib/scoring";
import type { OfferingDna, IcpProfile } from "./schemas";
import { setAiUsageSink, withAiUsageContext } from "@/lib/ai/usage-context";
import { recordAiUsageEvent } from "@/lib/billing/usage-tracking";
import { getGenerationProgress, type GenerationProgress } from "@/lib/db/queries";

// Registered once per process. Every AiProvider.complete() call reports
// through this sink when it runs inside the withAiUsageContext() below.
setAiUsageSink(recordAiUsageEvent);

// How many discovered companies actually get turned into accounts, most-
// corroborated first. This still bounds cost (each account is 2 LLM calls),
// just not wall-clock time within a single request anymore -- see the
// module comment below for why that distinction now matters.
const MAX_ACCOUNTS_PER_CAMPAIGN = Number(process.env.MAX_ACCOUNTS_PER_CAMPAIGN || 10);

/**
 * Generation used to be one long HTTP request running the whole pipeline
 * (Offering -> ICP -> Signal -> Research -> N accounts x Contact+GTM)
 * top to bottom, bounded by Vercel's function timeout (60s on Hobby, and
 * Hobby has no way to raise it). That meant a handful of real, non-mock LLM
 * calls -- each one legitimately taking 10-40s -- could add up to more than
 * the whole budget on their own, with no way to fix it by tuning constants:
 * 3 sequential calls at even a conservative 40s cap is already 120s.
 *
 * runNextStep() replaces that with a resumable state machine: each call
 * does exactly ONE bounded unit of work (one agent call, essentially) and
 * persists it, then returns. Nothing here ever has to finish an entire
 * campaign inside one request -- the caller (POST /api/campaigns/[id]/step)
 * just gets called repeatedly, by the campaign page polling itself, until
 * the campaign reaches a terminal status. See docs/launch-checklist.md.
 */
export async function runNextStep(campaignId: string): Promise<GenerationProgress> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");

  // Terminal already -- calling this again (a stray poll after the client
  // already saw "active"/"failed", a page reload) is a safe no-op.
  if (campaign.status === "active" || campaign.status === "failed") {
    return mustProgress(campaignId);
  }

  if (campaign.status === "draft") {
    await db.update(campaigns).set({ status: "generating" }).where(eq(campaigns.id, campaignId));
  }

  try {
    if (await stageGate(campaignId, "offering-agent", () => stepOffering(campaign, campaignId))) {
      return mustProgress(campaignId);
    }
    if (await stageGate(campaignId, "icp-agent", () => stepIcp(campaign, campaignId))) {
      return mustProgress(campaignId);
    }
    if (await stageGate(campaignId, "signal-agent", () => stepSignal(campaign, campaignId))) {
      return mustProgress(campaignId);
    }
    if (await stageGate(campaignId, "research-agent", () => stepResearchAndSeedAccounts(campaign, campaignId))) {
      return mustProgress(campaignId);
    }

    // Shared, once-per-campaign stages are all done. From here it's one
    // account at a time -- pending (needs Contact) before contacted (needs
    // GTM), so a campaign that dies mid-way always resumes at the right
    // place no matter which account it left off on.
    const [nextPending] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.campaignId, campaignId), eq(accounts.status, "pending")))
      .limit(1);
    if (nextPending) {
      await stepContact(campaign, nextPending);
      return mustProgress(campaignId);
    }

    const [nextContacted] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.campaignId, campaignId), eq(accounts.status, "contacted")))
      .limit(1);
    if (nextContacted) {
      await stepGtm(campaign, nextContacted);
      return mustProgress(campaignId);
    }

    // Nothing left pending or contacted (including the zero-accounts case,
    // if research found nothing) -- the pipeline is done.
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaignId));
    return mustProgress(campaignId);
  } catch {
    // A failure in one of the four shared stages above has no "other
    // accounts" to preserve -- they run once per campaign, not once per
    // account -- so there's nothing to isolate it from. Terminal "failed",
    // same as the old orchestrator's top-level catch. The specific error
    // is already recorded on that stage's research_runs row by logRun()
    // before it rethrows -- nothing more to capture here.
    await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, campaignId));
    return mustProgress(campaignId);
  }
}

/**
 * Runs `run()` (a single shared-stage step) unless that stage is already
 * done or already in flight, and reports whether the caller should stop
 * here and return.
 *
 * The "in flight" case matters because two step calls can legitimately
 * overlap for the same campaign -- a dev-mode double effect firing, two
 * browser tabs open on the same campaign page -- and offering_dna,
 * icp_profiles, and signal_taxonomies all have a UNIQUE constraint on
 * campaignId. Without this check, both callers would see "not done yet"
 * and both try to insert, and the loser's unique-constraint violation would
 * incorrectly mark the whole campaign "failed" over a harmless race rather
 * than a real error. Whichever call actually claimed the row (inserted the
 * "running" research_runs row first) proceeds normally; the other just
 * reports current progress and returns -- the next poll a moment later
 * will see it as "success" and move on.
 */
async function stageGate(campaignId: string, agent: string, run: () => Promise<void>): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(researchRuns)
    .where(and(eq(researchRuns.campaignId, campaignId), eq(researchRuns.agent, agent)))
    .limit(1);
  if (existing?.status === "success") return false; // done -- caller continues to the next stage
  if (existing?.status === "running") return true; // in flight elsewhere -- wait, don't restart it
  await run();
  return true;
}

async function mustProgress(campaignId: string): Promise<GenerationProgress> {
  const progress = await getGenerationProgress(campaignId);
  if (!progress) throw new Error("Campaign not found");
  return progress;
}

async function logRun(
  campaignId: string,
  agent: string,
  fn: () => Promise<unknown>,
  organizationId: string
) {
  const [run] = await db
    .insert(researchRuns)
    .values({ campaignId, agent, status: "running", input: {} })
    .returning();
  try {
    const output = await withAiUsageContext({ organizationId, campaignId, agent }, fn);
    await db
      .update(researchRuns)
      .set({ status: "success", output: output as object, finishedAt: new Date() })
      .where(eq(researchRuns.id, run.id));
    return { output, runId: run.id };
  } catch (err) {
    await db
      .update(researchRuns)
      .set({ status: "error", error: String(err), finishedAt: new Date() })
      .where(eq(researchRuns.id, run.id));
    throw err;
  }
}

async function stepOffering(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const { output: dna } = await logRun(
    campaignId,
    "offering-agent",
    () =>
      runOfferingAgent({
        name: campaign.name,
        website: campaign.website ?? undefined,
        problemsSolved: campaign.problemsSolved,
        outcomes: campaign.outcomes,
        differentiators: campaign.differentiators,
        competitors: campaign.competitors ?? undefined,
        knownIcp: campaign.knownIcp ?? undefined,
        knownPersonas: campaign.knownPersonas ?? undefined,
      }),
    campaign.organizationId
  );
  const offeringDna = dna as OfferingDna;

  const [offeringRow] = await db
    .insert(offeringDnaTable)
    .values({
      campaignId,
      coreProblem: offeringDna.coreProblem,
      capabilities: offeringDna.capabilities,
      differentiators: offeringDna.differentiators,
      painPoints: offeringDna.painPoints,
      buyingTriggers: offeringDna.buyingTriggers,
      objections: offeringDna.objections,
      alternatives: offeringDna.alternatives,
    })
    .returning();

  for (const persona of offeringDna.personas) {
    await db.insert(buyerPersonas).values({
      offeringDnaId: offeringRow.id,
      title: persona.title,
      painPoints: persona.painPoints,
      priorities: persona.priorities,
    });
  }
}

async function stepIcp(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const [offeringRow] = await db.select().from(offeringDnaTable).where(eq(offeringDnaTable.campaignId, campaignId)).limit(1);
  const personaRows = await db.select().from(buyerPersonas).where(eq(buyerPersonas.offeringDnaId, offeringRow.id));
  const offeringDna: OfferingDna = { ...offeringRow, personas: personaRows };

  const { output: icpOut } = await logRun(
    campaignId,
    "icp-agent",
    () =>
      runIcpAgent({
        offeringDna,
        targetIndustries: campaign.targetIndustries,
        targetGeographies: campaign.targetGeographies,
        targetCompanySize: campaign.targetCompanySize ?? undefined,
        knownIcp: campaign.knownIcp ?? undefined,
      }),
    campaign.organizationId
  );
  const icp = icpOut as IcpProfile;

  await db.insert(icpProfiles).values({
    campaignId,
    industries: icp.industries,
    geographies: icp.geographies,
    employeeMin: icp.employeeMin,
    employeeMax: icp.employeeMax,
    revenueMin: icp.revenueMin,
    revenueMax: icp.revenueMax,
    businessModel: icp.businessModel,
    techCharacteristics: icp.techCharacteristics,
    orgCharacteristics: icp.orgCharacteristics,
    buyingCommittee: icp.buyingCommittee,
  });
}

async function stepSignal(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const { offeringDna, icp } = await loadOfferingAndIcp(campaignId);

  const { output: taxonomyOut } = await logRun(
    campaignId,
    "signal-agent",
    () => runSignalAgent(offeringDna, icp),
    campaign.organizationId
  );
  const taxonomy = taxonomyOut as { signals: { name: string; tier: 1 | 2 | 3; description: string }[] };

  const [taxonomyRow] = await db.insert(signalTaxonomies).values({ campaignId }).returning();
  for (const s of taxonomy.signals) {
    await db.insert(signalDefinitions).values({
      taxonomyId: taxonomyRow.id,
      name: s.name,
      tier: s.tier,
      description: s.description,
    });
  }
}

/**
 * Research (Tavily/mock, no LLM call) + the deterministic verification pass
 * + seeding one "pending" account row per discovered company, all in one
 * step -- none of this involves an LLM call, so it's cheap and fast
 * regardless of how many companies come back. icpFit doesn't depend on
 * Contact or GTM, so it's computed and persisted right here; reachability/
 * opportunity are placeholders (0) until stepContact fills them in.
 */
async function stepResearchAndSeedAccounts(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const { icp } = await loadOfferingAndIcp(campaignId);
  const [taxonomyRow] = await db.select().from(signalTaxonomies).where(eq(signalTaxonomies.campaignId, campaignId)).limit(1);
  const signalDefs = await db.select().from(signalDefinitions).where(eq(signalDefinitions.taxonomyId, taxonomyRow.id));
  const taxonomy = { signals: signalDefs.map((s) => ({ name: s.name, tier: s.tier as 1 | 2 | 3, description: s.description })) };

  const { output: rawEvidenceOut, runId: researchRunId } = await logRun(
    campaignId,
    "research-agent",
    () => runResearchAgent(taxonomy, icp),
    campaign.organizationId
  );
  const rawEvidence = rawEvidenceOut as Awaited<ReturnType<typeof runResearchAgent>>;

  const verified = runVerificationAgent(rawEvidence);

  const byCompany = new Map<string, VerifiedSignal[]>();
  for (const v of verified) {
    if (!byCompany.has(v.companyName)) byCompany.set(v.companyName, []);
    byCompany.get(v.companyName)!.push(v);
  }

  const companiesToProcess = [...byCompany.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, MAX_ACCOUNTS_PER_CAMPAIGN);

  for (const [companyName, signalsForCompany] of companiesToProcess) {
    const industry = icp.industries[0] ?? null; // Phase 1: no firmographic enrichment yet (see README)
    const [account] = await db
      .insert(accounts)
      .values({
        campaignId,
        companyName,
        website: signalsForCompany[0].companyWebsite ?? null,
        industry,
        status: "pending",
      })
      .returning();

    for (const sig of signalsForCompany) {
      const [sourceRow] = await db
        .insert(researchSources)
        .values({
          researchRunId,
          url: sig.sourceUrl,
          publishedAt: sig.publishedAt ? new Date(sig.publishedAt) : null,
          excerpt: sig.evidence,
        })
        .returning();

      const matchedTaxonomyEntry = taxonomy.signals.find((t) =>
        sig.signalHint.toLowerCase().includes(t.name.toLowerCase().slice(0, 8))
      );

      await db.insert(accountSignals).values({
        accountId: account.id,
        signalName: matchedTaxonomyEntry?.name ?? sig.signalHint,
        tier: matchedTaxonomyEntry?.tier ?? 3,
        strength: sig.confidence * 100,
        confidence: sig.confidence,
        detectedAt: new Date(sig.detectedAt),
        publishedAt: sig.publishedAt ? new Date(sig.publishedAt) : null,
        verified: sig.verified,
        evidence: sig.evidence,
        sourceId: sourceRow.id,
      });
    }

    const icpFit = computeIcpFit({
      industryMatch: industry && icp.industries.includes(industry) ? 90 : 45,
      geographyMatch: 65, // Phase 1: no geo enrichment on mock accounts yet
      sizeMatch: 65,
      businessModelMatch: 65,
      techEnvironmentMatch: 60,
      problemRelevance: 70,
    });
    const intent = computeIntent(
      signalsForCompany.map((s) => ({
        tier: (taxonomy.signals.find((t) => t.name === s.signalHint)?.tier ?? 3) as 1 | 2 | 3,
        strength: s.confidence * 100,
        confidence: s.confidence,
        detectedAt: new Date(s.detectedAt),
      }))
    );

    // reachability/opportunity are placeholders until stepContact runs for
    // this account -- both depend on contact.confidence, which doesn't
    // exist yet. accountScores has no nullable columns for these (every
    // score shown in the UI is meant to be a real, explained number, not a
    // guess -- see src/lib/scoring/index.ts), so 0 stands in; the UI hides
    // the score entirely for a non-"done" account rather than showing a
    // misleading 0 (see campaigns/[id]/page.tsx).
    await db.insert(accountScores).values({ accountId: account.id, icpFit, intent, reachability: 0, opportunity: 0 });
  }
}

async function stepContact(campaign: typeof campaigns.$inferSelect, account: typeof accounts.$inferSelect) {
  try {
    const { offeringDna, icp } = await loadOfferingAndIcp(account.campaignId);
    const { output: contactOut } = await logRun(
      account.campaignId,
      "contact-agent",
      () => runContactAgent({ companyName: account.companyName, industry: account.industry, offeringDna, icp }),
      campaign.organizationId
    );
    const contact = contactOut as Awaited<ReturnType<typeof runContactAgent>>;

    await db.insert(contacts).values({
      accountId: account.id,
      name: contact.name,
      title: contact.title,
      isVerified: false,
      confidence: contact.confidence,
      relevance: contact.relevance,
    });

    const [score] = await db.select().from(accountScores).where(eq(accountScores.accountId, account.id)).limit(1);
    const reachability = computeReachability({
      decisionMakerIdentified: false,
      roleRelevance: 80,
      contactConfidence: contact.confidence,
    });
    const opportunity = computeOpportunityScore(score.icpFit, score.intent, reachability);
    await db.update(accountScores).set({ reachability, opportunity }).where(eq(accountScores.accountId, account.id));

    await db.update(accounts).set({ status: "contacted" }).where(eq(accounts.id, account.id));
  } catch (err) {
    // One account's failure must not sink the campaign or block the rest
    // of the queue -- mark just this account "failed" (with why, for the
    // UI) and move on; the next call to runNextStep() picks up the next
    // pending/contacted account normally.
    await db
      .update(accounts)
      .set({ status: "failed", failureReason: `contact-agent: ${String(err)}` })
      .where(eq(accounts.id, account.id));
  }
}

async function stepGtm(campaign: typeof campaigns.$inferSelect, account: typeof accounts.$inferSelect) {
  try {
    const { offeringDna } = await loadOfferingAndIcp(account.campaignId);
    // Exactly one contact row per account in this pipeline (stepContact
    // inserts it, nothing else does) -- no ordering needed to pick "the"
    // one.
    const [contact] = await db.select().from(contacts).where(eq(contacts.accountId, account.id)).limit(1);

    const signalRows = await db.select().from(accountSignals).where(eq(accountSignals.accountId, account.id));
    const sourceIds = signalRows.map((s) => s.sourceId);
    const sourceRows = sourceIds.length
      ? await db.select().from(researchSources).where(inArray(researchSources.id, sourceIds))
      : [];
    const sourceById = new Map(sourceRows.map((s) => [s.id, s]));
    const signals: VerifiedSignal[] = signalRows.map((s) => ({
      companyName: account.companyName,
      companyWebsite: account.website ?? undefined,
      signalHint: s.signalName,
      evidence: s.evidence,
      sourceUrl: sourceById.get(s.sourceId)?.url ?? "",
      publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
      detectedAt: s.detectedAt.toISOString(),
      verified: s.verified,
      confidence: s.confidence,
    }));

    const { output: outreachOut } = await logRun(
      account.campaignId,
      "gtm-agent",
      () =>
        runGtmAgent({
          companyName: account.companyName,
          signals,
          offeringDna,
          recommendedTitle: contact.title,
        }),
      campaign.organizationId
    );
    const outreach = outreachOut as Awaited<ReturnType<typeof runGtmAgent>>;

    await db.insert(outreachRecommendations).values({
      accountId: account.id,
      angle: outreach.angle,
      talkingPoints: outreach.talkingPoints,
      draftEmail: outreach.draftEmail,
      draftLinkedIn: outreach.draftLinkedIn,
      callOpener: outreach.callOpener,
    });

    await db.update(accounts).set({ status: "done" }).where(eq(accounts.id, account.id));
  } catch (err) {
    await db
      .update(accounts)
      .set({ status: "failed", failureReason: `gtm-agent: ${String(err)}` })
      .where(eq(accounts.id, account.id));
  }
}

async function loadOfferingAndIcp(campaignId: string): Promise<{ offeringDna: OfferingDna; icp: IcpProfile }> {
  const [offeringRow] = await db.select().from(offeringDnaTable).where(eq(offeringDnaTable.campaignId, campaignId)).limit(1);
  const personaRows = await db.select().from(buyerPersonas).where(eq(buyerPersonas.offeringDnaId, offeringRow.id));
  const [icpRow] = await db.select().from(icpProfiles).where(eq(icpProfiles.campaignId, campaignId)).limit(1);
  return {
    offeringDna: { ...offeringRow, personas: personaRows },
    icp: icpRow,
  };
}
