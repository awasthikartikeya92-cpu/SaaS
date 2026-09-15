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
  contactSources,
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
import { computeIcpFit, computeIntent, computeReachability, computeRoleRelevance, computeOpportunityScore } from "@/lib/scoring";
import type { OfferingDna, IcpProfile } from "./schemas";
import { setAiUsageSink, withAiUsageContext } from "@/lib/ai/usage-context";
import { recordAiUsageEvent } from "@/lib/billing/usage-tracking";
import { getGenerationProgress, type GenerationProgress } from "@/lib/db/queries";
import { decideStageAction } from "./stage-decision";
import { getContactEnrichmentProvider, type EnrichedContact } from "@/lib/contacts";
import { pickBestContact } from "@/lib/contacts/rank";

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
    return mustProgress(campaignId, campaign.organizationId);
  }

  if (campaign.status === "draft") {
    await db.update(campaigns).set({ status: "generating" }).where(eq(campaigns.id, campaignId));
  }

  try {
    if (await stageGate(campaignId, "offering-agent", () => stepOffering(campaign, campaignId))) {
      return mustProgress(campaignId, campaign.organizationId);
    }
    if (await stageGate(campaignId, "icp-agent", () => stepIcp(campaign, campaignId))) {
      return mustProgress(campaignId, campaign.organizationId);
    }
    if (await stageGate(campaignId, "signal-agent", () => stepSignal(campaign, campaignId))) {
      return mustProgress(campaignId, campaign.organizationId);
    }
    if (await stageGate(campaignId, "research-agent", () => stepResearchAndSeedAccounts(campaign, campaignId))) {
      return mustProgress(campaignId, campaign.organizationId);
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
      return mustProgress(campaignId, campaign.organizationId);
    }

    const [nextContacted] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.campaignId, campaignId), eq(accounts.status, "contacted")))
      .limit(1);
    if (nextContacted) {
      await stepGtm(campaign, nextContacted);
      return mustProgress(campaignId, campaign.organizationId);
    }

    // Nothing left pending or contacted (including the zero-accounts case,
    // if research found nothing) -- the pipeline is done.
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaignId));
    return mustProgress(campaignId, campaign.organizationId);
  } catch {
    // A failure in one of the four shared stages above has no "other
    // accounts" to preserve -- they run once per campaign, not once per
    // account -- so there's nothing to isolate it from. Terminal "failed",
    // same as the old orchestrator's top-level catch. The specific error
    // is already recorded on that stage's research_runs row by logRun()
    // before it rethrows -- nothing more to capture here.
    await db.update(campaigns).set({ status: "failed" }).where(eq(campaigns.id, campaignId));
    return mustProgress(campaignId, campaign.organizationId);
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
  const decision = decideStageAction(existing?.status);
  if (decision === "already-done") return false; // caller continues to the next stage
  if (decision === "in-flight") return true; // in flight elsewhere -- wait, don't restart it
  await run();
  return true;
}

async function mustProgress(campaignId: string, organizationId: string): Promise<GenerationProgress> {
  const progress = await getGenerationProgress(campaignId, organizationId);
  if (!progress) throw new Error("Campaign not found");
  return progress;
}

async function logRun(
  campaignId: string,
  agent: string,
  fn: (runId: string) => Promise<unknown>,
  organizationId: string
) {
  const [run] = await db
    .insert(researchRuns)
    .values({ campaignId, agent, status: "running", input: {} })
    .returning();
  try {
    const output = await withAiUsageContext({ organizationId, campaignId, agent }, () => fn(run.id));
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
  // The DB writes below run INSIDE logRun's callback, not after it returns
  // -- deliberately, after a real production failure showed why: a campaign
  // failed with the failure card reading "Generation failed at icp-agent"
  // but NO error text at all, and the "what already completed" summary
  // claimed "ICP: done". What actually happened: runIcpAgent() succeeded
  // (logRun marked that run "success" and returned), and the icp_profiles
  // INSERT *after* it threw -- but that insert wasn't covered by logRun's
  // own try/catch, so the thrown error skipped straight past it to
  // runNextStep()'s outer catch, which only knows how to mark the whole
  // campaign "failed" with no idea which agent or why. Wrapping the
  // persistence inside the same callback logRun awaits means ANY failure
  // in this stage -- the LLM call or the write that turns its output into
  // rows -- lands on this run's `error` column, where the failure card
  // actually reads it.
  await logRun(
    campaignId,
    "offering-agent",
    async () => {
      const offeringDna = await runOfferingAgent({
        name: campaign.name,
        website: campaign.website ?? undefined,
        problemsSolved: campaign.problemsSolved,
        outcomes: campaign.outcomes,
        differentiators: campaign.differentiators,
        competitors: campaign.competitors ?? undefined,
        knownIcp: campaign.knownIcp ?? undefined,
        knownPersonas: campaign.knownPersonas ?? undefined,
      });

      // In a transaction -- required for a failed campaign to be safely
      // retryable (see the Retry button in campaigns/[id]/page.tsx and
      // POST /api/campaigns/[id]/retry), not just nice to have. Without
      // it, a failure partway through the persona loop would leave the
      // offering_dna row committed on its own; a retry re-running this
      // whole stage from scratch would then hit offering_dna's UNIQUE
      // campaignId constraint on the very first insert and fail every
      // time after, with no way to recover short of a manual DB fix. The
      // transaction makes a failure anywhere in this stage roll back
      // everything it wrote, so a retry always starts from a clean slate.
      await db.transaction(async (tx) => {
        const [offeringRow] = await tx
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
          await tx.insert(buyerPersonas).values({
            offeringDnaId: offeringRow.id,
            title: persona.title,
            painPoints: persona.painPoints,
            priorities: persona.priorities,
          });
        }
      });

      return offeringDna;
    },
    campaign.organizationId
  );
}

async function stepIcp(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const [offeringRow] = await db.select().from(offeringDnaTable).where(eq(offeringDnaTable.campaignId, campaignId)).limit(1);
  const personaRows = await db.select().from(buyerPersonas).where(eq(buyerPersonas.offeringDnaId, offeringRow.id));
  const offeringDna: OfferingDna = { ...offeringRow, personas: personaRows };

  // See stepOffering's comment -- same reasoning, and this is the stage
  // that actually surfaced the bug: icp_profiles.revenueMin/revenueMax
  // used to be `integer` (max ~2.1B), and this product's own ICP is
  // routinely a large public enterprise (see schema.ts's comment on those
  // columns) whose revenue in dollars exceeds that easily. The overflow
  // is fixed at the column level too (now doublePrecision), but this
  // restructure is what makes the *next* unanticipated insert failure --
  // whatever it turns out to be -- show up with a real error message
  // instead of a silent, misleadingly-"successful" icp-agent run.
  await logRun(
    campaignId,
    "icp-agent",
    async () => {
      const icp = await runIcpAgent({
        offeringDna,
        targetIndustries: campaign.targetIndustries,
        targetGeographies: campaign.targetGeographies,
        targetCompanySize: campaign.targetCompanySize ?? undefined,
        knownIcp: campaign.knownIcp ?? undefined,
      });

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

      return icp;
    },
    campaign.organizationId
  );
}

async function stepSignal(campaign: typeof campaigns.$inferSelect, campaignId: string) {
  const { offeringDna, icp } = await loadOfferingAndIcp(campaignId);

  // See stepOffering's comment -- same reasoning.
  await logRun(
    campaignId,
    "signal-agent",
    async () => {
      const taxonomy = await runSignalAgent(offeringDna, icp);

      // In a transaction -- same reasoning as stepOffering's: without it, a
      // failure partway through the definitions loop would leave the
      // signal_taxonomies row committed alone, and a retry would hit its
      // UNIQUE campaignId constraint on the first insert every time after.
      await db.transaction(async (tx) => {
        const [taxonomyRow] = await tx.insert(signalTaxonomies).values({ campaignId }).returning();
        for (const s of taxonomy.signals) {
          await tx.insert(signalDefinitions).values({
            taxonomyId: taxonomyRow.id,
            name: s.name,
            tier: s.tier,
            description: s.description,
          });
        }
      });

      return taxonomy;
    },
    campaign.organizationId
  );
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

  // See stepOffering's comment for why the whole seeding loop -- not just
  // the research call -- runs inside logRun's callback: this is the
  // biggest one of the four (an insert per company, per signal, plus a
  // score row), so it's the stage with the most surface for an
  // unanticipated write failure to slip past logRun's own error handling
  // the way the icp_profiles one did.
  await logRun(
    campaignId,
    "research-agent",
    async (researchRunId) => {
      const rawEvidence = await runResearchAgent(taxonomy, icp);
      const verified = runVerificationAgent(rawEvidence);

      const byCompany = new Map<string, VerifiedSignal[]>();
      for (const v of verified) {
        if (!byCompany.has(v.companyName)) byCompany.set(v.companyName, []);
        byCompany.get(v.companyName)!.push(v);
      }

      const companiesToProcess = [...byCompany.entries()]
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, MAX_ACCOUNTS_PER_CAMPAIGN);

      // The whole loop below runs inside one transaction -- same reasoning
      // as stepOffering's and stepSignal's, but the stakes are higher
      // here: accounts has no unique constraint on (campaignId,
      // companyName), so without a transaction a failure partway through
      // company N wouldn't even fail loudly on retry -- it would silently
      // re-insert companies 1..N-1 as duplicate account rows (research
      // returns roughly the same companies again), doubling them up in
      // the UI with no error to explain why. One transaction around the
      // whole loop means a failure anywhere rolls back every company this
      // attempt inserted, so a retry always starts from zero accounts for
      // this stage, not a partial, silently-duplicating set.
      await db.transaction(async (tx) => {
        for (const [companyName, signalsForCompany] of companiesToProcess) {
          const industry = icp.industries[0] ?? null; // Phase 1: no firmographic enrichment yet (see README)
          const [account] = await tx
            .insert(accounts)
            .values({
              campaignId,
              companyName,
              website: signalsForCompany[0].companyWebsite ?? null,
              industry,
              status: "pending",
            })
            .returning();

          // Matched once per signal and reused below for both the persisted
          // accountSignals row and the intent calculation -- these used to
          // be two separate lookups (a fuzzy substring match here, an
          // exact-name match down in computeIntent's input) that almost
          // never agreed, since sig.signalHint is essentially never
          // byte-identical to a taxonomy entry's name. That silently made
          // computeIntent treat nearly every signal as the weakest tier
          // (the `?? 3` fallback), regardless of what tier the account's
          // own signal list showed the user.
          const matchedTaxonomyEntries = signalsForCompany.map((sig) =>
            taxonomy.signals.find((t) => sig.signalHint.toLowerCase().includes(t.name.toLowerCase().slice(0, 8)))
          );

          for (const [i, sig] of signalsForCompany.entries()) {
            const [sourceRow] = await tx
              .insert(researchSources)
              .values({
                researchRunId,
                url: sig.sourceUrl,
                publishedAt: sig.publishedAt ? new Date(sig.publishedAt) : null,
                excerpt: sig.evidence,
              })
              .returning();

            const matchedTaxonomyEntry = matchedTaxonomyEntries[i];

            await tx.insert(accountSignals).values({
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
            // `industry` above is always icp.industries[0] -- there's no
            // firmographic enrichment connected yet to independently verify
            // which industry an account actually operates in (see
            // docs/launch-checklist.md's SEC EDGAR/firmographics roadmap
            // item). The previous `icp.industries.includes(industry) ? 90 :
            // 45` check was tautological -- industry was assigned FROM that
            // exact array moments earlier, so it was always true, always 90,
            // on every single account in every campaign, while looking like
            // a real per-account comparison. Flattened to the same honest,
            // clearly-labeled placeholder as the sub-scores below rather
            // than a check that's always true dressed up as a real one --
            // until real firmographic data exists to genuinely tell
            // accounts apart on this dimension.
            industryMatch: 65,
            geographyMatch: 65, // Phase 1: no geo enrichment on mock accounts yet
            sizeMatch: 65,
            businessModelMatch: 65,
            techEnvironmentMatch: 60,
            problemRelevance: 70,
          });
          const intent = computeIntent(
            signalsForCompany.map((s, i) => ({
              tier: (matchedTaxonomyEntries[i]?.tier ?? 3) as 1 | 2 | 3,
              confidence: s.confidence,
              detectedAt: new Date(s.detectedAt),
            }))
          );

          // reachability/opportunity are placeholders until stepContact
          // runs for this account -- both depend on contact.confidence,
          // which doesn't exist yet. accountScores has no nullable columns
          // for these (every score shown in the UI is meant to be a real,
          // explained number, not a guess -- see src/lib/scoring/index.ts),
          // so 0 stands in; the UI hides the score entirely for a
          // non-"done" account rather than showing a misleading 0 (see
          // campaigns/[id]/page.tsx).
          await tx.insert(accountScores).values({ accountId: account.id, icpFit, intent, reachability: 0, opportunity: 0 });
        }
      });

      return rawEvidence;
    },
    campaign.organizationId
  );
}

// Bounds the whole enrichment attempt below, not any one provider's own
// internal timeout -- with TeamPageProvider composed in (real page fetches
// plus an LLM call), the slowest configured provider could otherwise run
// long enough to meaningfully threaten the calling route's overall time
// budget (see step/route.ts's own comment on that budget). Racing against
// this doesn't cancel the slower providers -- their requests keep running
// in the background and complete or fail on their own -- it just means
// this function stops waiting and falls through to the existing
// LLM-recommended-title path, the same safe outcome as any other
// enrichment failure.
const ENRICHMENT_TIMEOUT_MS = 20_000;

/**
 * Real, deterministic verification, tried before ever falling back to the
 * Contact Agent's LLM-recommended title. Returns null -- never throws out to
 * the caller -- whenever a verified contact isn't available for any reason:
 * no provider configured (the normal case until a real one is set up), no
 * website on this account, a network/API failure, taking too long (see
 * ENRICHMENT_TIMEOUT_MS above), or no candidate confident and relevant
 * enough to surface (see rank.ts). Enrichment is additive infrastructure
 * layered on a pipeline that already works without it -- a flaky
 * third-party lookup must never turn into an account failure when the
 * existing safe fallback is right there.
 */
async function tryFindVerifiedContact(
  account: typeof accounts.$inferSelect,
  personaTitles: string[]
): Promise<EnrichedContact | null> {
  const provider = getContactEnrichmentProvider();
  if (!provider || !account.website) return null;

  const domain = extractDomain(account.website);
  if (!domain) return null;

  try {
    const candidates = await Promise.race([
      provider.findContacts({ domain, companyName: account.companyName }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ENRICHMENT_TIMEOUT_MS)),
    ]);
    if (candidates === null) {
      console.error(`[contact-enrichment] ${provider.name} lookup for ${domain} exceeded ${ENRICHMENT_TIMEOUT_MS}ms, falling back to a recommended title`);
      return null;
    }
    return pickBestContact(candidates, personaTitles);
  } catch (err) {
    console.error(`[contact-enrichment] ${provider.name} lookup failed for ${domain}, falling back to a recommended title:`, err);
    return null;
  }
}

/** account.website may be a bare hostname (how Tavily stores it) or a full URL -- normalize either to a bare hostname. */
function extractDomain(website: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function stepContact(campaign: typeof campaigns.$inferSelect, account: typeof accounts.$inferSelect) {
  try {
    const { offeringDna, icp } = await loadOfferingAndIcp(account.campaignId);
    const personaTitles = offeringDna.personas.map((p) => p.title);

    // Real enrichment first, LLM-recommended title as the fallback -- never
    // the other way around. A verified person only ever comes from
    // deterministic third-party data (see src/lib/contacts/rank.ts's own
    // comment); the LLM is never trusted to decide isVerified or invent a
    // name itself, matching the same "never invent a contact" rule the
    // Contact Agent's own prompt already enforces for its fallback path.
    const enriched = await tryFindVerifiedContact(account, personaTitles);

    let contact: { name: string | null; title: string; isVerified: boolean; confidence: number; relevance: string };
    let verifiedSourceUrl: string | null = null;

    if (enriched) {
      contact = {
        name: enriched.name,
        title: enriched.title,
        isVerified: true,
        confidence: enriched.confidence,
        relevance: `Verified via Hunter's domain search: a real, named ${enriched.title} at this company -- not a recommendation.`,
      };
      verifiedSourceUrl = enriched.linkedinUrl;
    } else {
      const { output: contactOut } = await logRun(
        account.campaignId,
        "contact-agent",
        () => runContactAgent({ companyName: account.companyName, industry: account.industry, offeringDna, icp }),
        campaign.organizationId
      );
      contact = contactOut as Awaited<ReturnType<typeof runContactAgent>>;
    }

    const [contactRow] = await db
      .insert(contacts)
      .values({
        accountId: account.id,
        name: contact.name,
        title: contact.title,
        isVerified: contact.isVerified,
        confidence: contact.confidence,
        relevance: contact.relevance,
      })
      .returning();

    if (verifiedSourceUrl) {
      await db.insert(contactSources).values({ contactId: contactRow.id, url: verifiedSourceUrl });
    }

    const [score] = await db.select().from(accountScores).where(eq(accountScores.accountId, account.id)).limit(1);
    const reachability = computeReachability({
      // Was hardcoded false regardless of what actually happened above --
      // computeReachability has always had a real, higher-weighted formula
      // for a verified decision maker (see its own comment in
      // src/lib/scoring/index.ts), it just had no way to ever be true until
      // real enrichment existed to genuinely verify one.
      decisionMakerIdentified: contact.isVerified,
      // Was a flat 80 for every account -- computeRoleRelevance uses real
      // data instead: does the contact's title actually match one of the
      // buyer personas the Offering Agent derived from what the user
      // described, or is it unrelated to any stated persona? See
      // src/lib/scoring/index.ts.
      roleRelevance: computeRoleRelevance(contact.title, personaTitles),
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
