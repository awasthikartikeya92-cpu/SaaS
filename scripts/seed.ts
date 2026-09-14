// Seeds a demo org, user, and one fully-populated campaign so the dashboard
// has realistic data on first run without needing an ANTHROPIC_API_KEY.
// This mirrors exactly what `runOrchestrator` would have written -- it's
// the same shape of data, just constructed directly rather than via an AI
// call, since seeding shouldn't depend on a live API key.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import {
  organizations,
  users,
  campaigns,
  offeringDna,
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
} from "../src/lib/db/schema";
import { computeIcpFit, computeIntent, computeReachability, computeOpportunityScore } from "../src/lib/scoring";

async function main() {
  console.log("Seeding...");

  const [org] = await db.insert(organizations).values({ name: "Ridgeline Ops (demo)" }).returning();

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await db.insert(users).values({
    email: "demo@signaliq.dev",
    name: "Demo User",
    passwordHash,
    organizationId: org.id,
  });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      name: "Ridgeline Ops Platform",
      website: "https://ridgelineops.com",
      problemsSolved:
        "Mid-market logistics and manufacturing companies run dispatch, inventory, and field service on disconnected spreadsheets and legacy tools, causing missed SLAs and manual reconciliation.",
      outcomes: "Cuts SLA misses by consolidating dispatch, inventory, and field service into one operations layer.",
      differentiators:
        "Deploys in under two weeks with no rip-and-replace of existing ERP; purpose-built for mid-market logistics, not a generic ops suite.",
      targetIndustries: ["Logistics", "Manufacturing", "Retail"],
      targetGeographies: ["United States", "Canada"],
      targetCompanySize: "200-2000 employees",
      status: "active",
    })
    .returning();

  const [dna] = await db
    .insert(offeringDna)
    .values({
      campaignId: campaign.id,
      coreProblem: "Fragmented operations tooling causes missed SLAs and manual reconciliation across dispatch, inventory, and field service.",
      capabilities: ["Unified dispatch board", "Real-time inventory sync", "Field service scheduling", "SLA breach alerting"],
      differentiators: ["Two-week deployment", "No ERP rip-and-replace", "Built specifically for mid-market logistics"],
      painPoints: ["Missed SLAs from disconnected systems", "Manual reconciliation overhead", "No real-time visibility into field ops"],
      buyingTriggers: ["Recent SLA-related customer complaints", "Ops leadership hire or reorg", "Warehouse or fleet expansion"],
      objections: ["Concern about integration with existing ERP", "Prior bad experience with a generic ops suite"],
      alternatives: ["Generic ERP add-on modules", "Spreadsheet + email coordination", "Legacy on-prem dispatch software"],
    })
    .returning();

  await db.insert(buyerPersonas).values([
    { offeringDnaId: dna.id, title: "VP of Operations", painPoints: ["SLA misses", "No real-time visibility"], priorities: ["Reliability", "Fast time-to-value"] },
    { offeringDnaId: dna.id, title: "Director of Logistics", painPoints: ["Manual dispatch coordination"], priorities: ["Reduced manual work", "Fleet utilization"] },
  ]);

  await db.insert(icpProfiles).values({
    campaignId: campaign.id,
    industries: ["Logistics", "Manufacturing", "Retail"],
    geographies: ["United States", "Canada"],
    employeeMin: 200,
    employeeMax: 2000,
    revenueMin: 20_000_000,
    revenueMax: 500_000_000,
    businessModel: "B2B, asset-heavy operations",
    techCharacteristics: ["Legacy ERP in place", "Limited real-time visibility tooling"],
    orgCharacteristics: ["Dedicated operations leadership", "Multi-site or multi-fleet"],
    buyingCommittee: ["VP Operations", "Director of Logistics", "IT/Systems lead (integration sign-off)"],
  });

  const [taxonomy] = await db.insert(signalTaxonomies).values({ campaignId: campaign.id }).returning();
  const signalDefs = [
    { name: "Dispatch/ops-tooling job posting", tier: 1 as const, description: "Company posts a role naming dispatch, fleet, or ops-visibility tooling directly." },
    { name: "SLA or fulfillment complaint mention", tier: 1 as const, description: "Public mention of missed SLAs, delivery delays, or fulfillment issues." },
    { name: "Operations leadership change", tier: 2 as const, description: "New VP/Director of Operations or Logistics hired or promoted." },
    { name: "Warehouse or fleet expansion", tier: 2 as const, description: "Announced new warehouse, distribution center, or fleet expansion." },
    { name: "Regional business press mention", tier: 3 as const, description: "Mentioned in regional business press discussing operational growth or budget." },
    { name: "Case study referencing incomplete tooling", tier: 3 as const, description: "Published case study or blog referencing a partial/legacy solution in this category." },
  ];
  for (const s of signalDefs) {
    await db.insert(signalDefinitions).values({ taxonomyId: taxonomy.id, ...s });
  }

  const [researchRun] = await db
    .insert(researchRuns)
    .values({ campaignId: campaign.id, agent: "research-agent (seed)", status: "success", input: {}, output: {}, finishedAt: new Date() })
    .returning();

  const mockAccounts = [
    { name: "Ridgeline Freight Systems", website: "ridgelinefreight.com", industry: "Logistics", daysAgo: 2, signalIdx: 0 },
    { name: "Ashworth Manufacturing Co.", website: "ashworthmfg.com", industry: "Manufacturing", daysAgo: 5, signalIdx: 2 },
    { name: "Palisade Retail Holdings", website: "palisaderetail.com", industry: "Retail", daysAgo: 9, signalIdx: 1 },
    { name: "Marrow Freight & Fulfillment", website: "marrowfreight.com", industry: "Logistics", daysAgo: 14, signalIdx: 3 },
    { name: "Corvid Distribution Partners", website: "corviddist.com", industry: "Logistics", daysAgo: 21, signalIdx: 4 },
    { name: "Northbay Industrial Supply", website: "northbayindustrial.com", industry: "Manufacturing", daysAgo: 27, signalIdx: 5 },
  ];

  for (const m of mockAccounts) {
    const [account] = await db
      .insert(accounts)
      .values({ campaignId: campaign.id, companyName: m.name, website: m.website, industry: m.industry, geography: "United States" })
      .returning();

    const detectedAt = new Date(Date.now() - m.daysAgo * 24 * 60 * 60 * 1000);
    const def = signalDefs[m.signalIdx];
    const confidence = def.tier === 1 ? 0.85 : def.tier === 2 ? 0.72 : 0.58;

    const [source] = await db
      .insert(researchSources)
      .values({
        researchRunId: researchRun.id,
        url: `https://${m.website}/newsroom/update`,
        publishedAt: detectedAt,
        excerpt: `${m.name}: ${def.description}`,
      })
      .returning();

    await db.insert(accountSignals).values({
      accountId: account.id,
      signalName: def.name,
      tier: def.tier,
      strength: confidence * 100,
      confidence,
      detectedAt,
      publishedAt: detectedAt,
      verified: true,
      evidence: `${m.name}: ${def.description}`,
      sourceId: source.id,
    });

    const icpFit = computeIcpFit({
      industryMatch: 90,
      geographyMatch: 85,
      sizeMatch: 70,
      businessModelMatch: 75,
      techEnvironmentMatch: 65,
      problemRelevance: 80,
    });
    const intent = computeIntent([{ tier: def.tier, confidence, detectedAt }]);
    const reachability = computeReachability({ decisionMakerIdentified: false, roleRelevance: 80, contactConfidence: 0.6 });
    const opportunity = computeOpportunityScore(icpFit, intent, reachability);

    await db.insert(accountScores).values({ accountId: account.id, icpFit, intent, reachability, opportunity });

    await db.insert(contacts).values({
      accountId: account.id,
      name: null,
      title: "VP of Operations",
      isVerified: false,
      confidence: 0.6,
      relevance: "Owns SLA and dispatch performance -- most likely to feel the pain this signal points at.",
    });

    await db.insert(outreachRecommendations).values({
      accountId: account.id,
      angle: `Lead with the observed signal (${def.name.toLowerCase()}) and connect it to SLA reliability, not a generic product pitch.`,
      talkingPoints: [
        "Reference the specific public signal, not a cold intro",
        "Anchor on time-to-value (two-week deployment)",
        "Address the ERP-integration objection early",
      ],
      draftEmail: null,
      draftLinkedIn: null,
      callOpener: null,
    });
  }

  console.log("Seed complete. Login with demo@signaliq.dev / demo1234");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
