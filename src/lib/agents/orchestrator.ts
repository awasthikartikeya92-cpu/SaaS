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
import { eq } from "drizzle-orm";
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

// Registered once per process. Every AiProvider.complete() call reports
// through this sink when it runs inside the withAiUsageContext() below.
setAiUsageSink(recordAiUsageEvent);

// Bounds both cost and wall-clock time. The mock provider always returned
// exactly 6 companies, so this never mattered before; a real research
// provider (Tavily) can return anywhere from 0 to several dozen distinct
// companies, and each one costs 2 sequential-feeling LLM calls (Contact +
// GTM) -- unbounded, that's easily more total work than the generate
// route's 60s budget (see maxDuration there) allows. When there are more
// candidates than this, the ones with the most corroborating evidence go
// first -- see the sort before the slice below.
const MAX_ACCOUNTS_PER_CAMPAIGN = Number(process.env.MAX_ACCOUNTS_PER_CAMPAIGN || 10);

// How many accounts to run Contact+GTM for at once. Sequential would be
// safest against rate limits but, combined with the account cap above,
// still risks exceeding the time budget (10 accounts x ~10s each is
// already the whole budget on its own). Concurrency this low stays well
// under any real Anthropic rate limit while cutting wall-clock time
// roughly proportionally.
const ACCOUNT_CONCURRENCY = 3;

/** Runs `worker` over `items` with at most `concurrency` in flight at once. */
async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    await worker(items[index]);
    return runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
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

/**
 * Runs the full pipeline for a campaign: Offering -> ICP -> Signals ->
 * Research -> Verification -> Accounts/Scoring -> Contacts -> GTM angle.
 * Every stage persists its output so a failure partway through doesn't lose
 * prior stages, and every AccountSignal traces back to a ResearchSource row.
 */
export async function runOrchestrator(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");

  await db.update(campaigns).set({ status: "generating" }).where(eq(campaigns.id, campaignId));

  try {
    await runPipeline(campaign, campaignId);
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaignId));
  } catch (err) {
    // Without this, a thrown error (e.g. no ANTHROPIC_API_KEY configured)
    // leaves the campaign stuck at "generating" forever -- logRun already
    // recorded which stage failed and why in research_runs, but the
    // campaign itself needs its own terminal state so the UI (and anyone
    // creating a new campaign) can tell "still running" apart from "failed
    // partway through, will never finish on its own."
    await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, campaignId));
    throw err;
  }
}

async function runPipeline(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  // 1. Offering Agent
  const { output: dna } = await logRun(campaignId, "offering-agent", () =>
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

  // 2. ICP Agent
  const { output: icpOut } = await logRun(campaignId, "icp-agent", () =>
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

  // 3. Signal Agent
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

  // 4. Research Agent (mock provider in Phase 1)
  const { output: rawEvidenceOut, runId: researchRunId } = await logRun(
    campaignId,
    "research-agent",
    () => runResearchAgent(taxonomy, icp),
    campaign.organizationId
  );
  const rawEvidence = rawEvidenceOut as Awaited<ReturnType<typeof runResearchAgent>>;

  // 5. Verification Agent
  const verified = runVerificationAgent(rawEvidence);

  // Group verified evidence by company -> one Account per company
  const byCompany = new Map<string, VerifiedSignal[]>();
  for (const v of verified) {
    if (!byCompany.has(v.companyName)) byCompany.set(v.companyName, []);
    byCompany.get(v.companyName)!.push(v);
  }

  // Most-corroborated companies first, then cap -- see MAX_ACCOUNTS_PER_CAMPAIGN.
  const companiesToProcess = [...byCompany.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, MAX_ACCOUNTS_PER_CAMPAIGN);

  await processWithConcurrency(companiesToProcess, ACCOUNT_CONCURRENCY, async ([companyName, signalsForCompany]) => {
    try {
      await processAccount(campaign, campaignId, companyName, signalsForCompany, icp, offeringDna, taxonomy, researchRunId);
    } catch (err) {
      // One account's failure (a model error, a JSON parse failure, etc.)
      // must not sink every other account already in flight or still
      // queued -- logRun already recorded the specific agent/error for
      // this company in research_runs; this is just the safety net that
      // keeps the rest of the campaign going instead of the whole
      // pipeline throwing and the campaign becoming "failed" over one bad
      // account out of possibly ten.
      console.error(`[orchestrator] account "${companyName}" failed, continuing with the rest:`, err);
    }
  });
}

async function processAccount(
  campaign: typeof campaigns.$inferSelect,
  campaignId: string,
  companyName: string,
  signalsForCompany: VerifiedSignal[],
  icp: IcpProfile,
  offeringDna: OfferingDna,
  taxonomy: { signals: { name: string; tier: 1 | 2 | 3; description: string }[] },
  researchRunId: string
) {
  const industry = icp.industries[0] ?? null; // Phase 1: no firmographic enrichment yet (see README)
  const [account] = await db
    .insert(accounts)
    .values({
      campaignId,
      companyName,
      website: signalsForCompany[0].companyWebsite ?? null,
      industry,
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

  // 6. Scoring -- deterministic, see lib/scoring
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

  // 7. Contact Agent -- never a verified name in Phase 1 (mock provider has
  // no person-level data), always a recommended title.
  const { output: contactOut } = await logRun(
    campaignId,
    "contact-agent",
    () => runContactAgent({ companyName, industry, offeringDna, icp }),
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

  const reachability = computeReachability({
    decisionMakerIdentified: false,
    roleRelevance: 80,
    contactConfidence: contact.confidence,
  });

  const opportunity = computeOpportunityScore(icpFit, intent, reachability);

  await db.insert(accountScores).values({
    accountId: account.id,
    icpFit,
    intent,
    reachability,
    opportunity,
  });

  // 8. GTM Strategist
  const { output: outreachOut } = await logRun(
    campaignId,
    "gtm-agent",
    () =>
      runGtmAgent({
        companyName,
        signals: signalsForCompany,
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
}
