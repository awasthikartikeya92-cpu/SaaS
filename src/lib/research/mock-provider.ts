import type { ResearchProvider, ResearchQuery, RawEvidence } from "./provider";

// Deterministic mock data shaped exactly like what a real search/enrichment
// provider would return -- source URL, publish date, excerpt -- so the
// Verification/Scoring agents and the evidence UI can be built and tested
// against something realistic, without a live API key.
const MOCK_COMPANIES = [
  { name: "Ridgeline Freight Systems", website: "ridgelinefreight.com", industry: "Logistics" },
  { name: "Northbay Financial Group", website: "northbayfg.com", industry: "Financial Services" },
  { name: "Corvid Health Partners", website: "corvidhealth.com", industry: "Healthcare" },
  { name: "Ashworth Manufacturing Co.", website: "ashworthmfg.com", industry: "Manufacturing" },
  { name: "Palisade Retail Holdings", website: "palisaderetail.com", industry: "Retail" },
  { name: "Marrow Data Systems", website: "marrowdata.com", industry: "Technology" },
];

const MOCK_EVIDENCE_TEMPLATES = [
  (c: string) => `${c} posted three open roles referencing the evaluated capability area in the last 30 days.`,
  (c: string) => `${c}'s leadership team announced a reorganization affecting the relevant buying function.`,
  (c: string) => `${c} was mentioned in a regional business publication discussing budget growth for this category.`,
  (c: string) => `${c} published a case study referencing a related but incomplete solution.`,
  (c: string) => `${c} expanded into a new geography, a context consistent with the offering's buying triggers.`,
];

export class MockResearchProvider implements ResearchProvider {
  name = "mock";

  async search(query: ResearchQuery): Promise<RawEvidence[]> {
    const evidence: RawEvidence[] = [];
    const signals = query.signalNames.length > 0 ? query.signalNames : ["general interest"];

    MOCK_COMPANIES.forEach((company, i) => {
      const template = MOCK_EVIDENCE_TEMPLATES[i % MOCK_EVIDENCE_TEMPLATES.length];
      const daysAgo = 2 + i * 5;
      const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      evidence.push({
        companyName: company.name,
        companyWebsite: company.website,
        url: `https://${company.website}/newsroom/update-${i + 1}`,
        publishedAt,
        excerpt: template(company.name),
        signalHint: signals[i % signals.length],
      });
    });

    return evidence;
  }
}
