import { getCampaignDetail } from "@/lib/db/queries";

export interface ReportContent {
  executiveSummary: string;
  offeringUnderstanding: { coreProblem: string; capabilities: string[]; differentiators: string[] } | null;
  icp: { industries: string[]; geographies: string[] } | null;
  signalTaxonomy: { name: string; tier: number; description: string }[];
  accountUniverseSize: number;
  priorityAccounts: { companyName: string; opportunity: number }[];
  decisionMakersOrPersonas: string[];
  methodology: string;
}

/**
 * Report Generator agent -- Phase 1 assembles this deterministically from
 * data the other agents already produced and validated (no new AI call, no
 * new facts). Section numbering follows the brief's 11-part report
 * structure; sections 6 (account intelligence detail) and 10 (evidence/
 * sources) live on the per-account page rather than duplicated here.
 */
export async function buildReportContent(campaignId: string): Promise<ReportContent | null> {
  const data = await getCampaignDetail(campaignId);
  if (!data) return null;

  const priority = data.accounts
    .filter((a) => (a.score?.opportunity ?? 0) >= 60)
    .sort((a, b) => (b.score?.opportunity ?? 0) - (a.score?.opportunity ?? 0))
    .map((a) => ({ companyName: a.companyName, opportunity: a.score?.opportunity ?? 0 }));

  return {
    executiveSummary: `${data.campaign.name}: ${data.accounts.length} accounts analyzed against the derived ICP, ${priority.length} at high priority (opportunity score >= 60). All findings are inferred from public signals -- opportunity hypotheses, not confirmed buying intent.`,
    offeringUnderstanding: data.offeringDna
      ? {
          coreProblem: data.offeringDna.coreProblem,
          capabilities: data.offeringDna.capabilities,
          differentiators: data.offeringDna.differentiators,
        }
      : null,
    icp: data.icp ? { industries: data.icp.industries, geographies: data.icp.geographies } : null,
    signalTaxonomy: data.signals.map((s) => ({ name: s.name, tier: s.tier, description: s.description })),
    accountUniverseSize: data.accounts.length,
    priorityAccounts: priority,
    decisionMakersOrPersonas: [...new Set(data.personas.map((p) => p.title))],
    methodology:
      "Signals were discovered via the configured research provider, filtered by the Verification Agent (unverifiable items marked 'Not verified' and excluded from scoring), then scored with a fixed 40% ICP fit / 40% intent / 20% reachability formula. No score is an unexplained AI estimate.",
  };
}
