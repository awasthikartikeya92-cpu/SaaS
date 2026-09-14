import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { OfferingDna, IcpProfile } from "./schemas";

// contact-agent.ts and gtm-agent.ts only import getAiProvider/getModelForAgent/
// schemas -- none of which touch @/lib/db -- so, unlike orchestrator.ts, they're
// safe to import directly in a test without a live Postgres connection.

const OFFERING_DNA: OfferingDna = {
  coreProblem: "Fragmented ops tooling",
  capabilities: ["Dispatch board"],
  differentiators: ["Two-week deploy"],
  painPoints: ["Missed SLAs"],
  buyingTriggers: ["Fleet expansion"],
  objections: ["ERP integration concern"],
  alternatives: ["Spreadsheets"],
  personas: [{ title: "VP of Operations", painPoints: [], priorities: [] }],
};

const ICP: IcpProfile = {
  industries: ["Logistics"],
  geographies: ["United States"],
  employeeMin: 200,
  employeeMax: 2000,
  revenueMin: null,
  revenueMax: null,
  businessModel: null,
  techCharacteristics: [],
  orgCharacteristics: [],
  buyingCommittee: [],
};

// Minimal shape of the request body this test actually inspects -- not a
// real Anthropic SDK type, just enough to avoid `unknown` everywhere below.
interface CapturedContentSegment {
  text: string;
  cache_control?: { type: string };
}
interface CapturedRequestBody {
  messages: { content: CapturedContentSegment[] }[];
}

let captured: CapturedRequestBody[];

function mockFetchOnce(responseText: string) {
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, opts: { body: string }) => {
      captured.push(JSON.parse(opts.body));
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: responseText }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
}

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-fake-key-for-tests");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules(); // getAiProvider() caches its provider instance at module scope
});

describe("contact-agent.ts prompt caching", () => {
  it("splits offeringDna/icp (cacheable) from the per-account fields, byte-identical across accounts", async () => {
    mockFetchOnce('{"name":null,"title":"VP of Ops","isVerified":false,"confidence":0.7,"relevance":"x","sourceUrls":[]}');
    const { runContactAgent } = await import("./contact-agent");

    await runContactAgent({ companyName: "Acme Corp", industry: "Logistics", offeringDna: OFFERING_DNA, icp: ICP });
    await runContactAgent({ companyName: "Beta Inc", industry: "Manufacturing", offeringDna: OFFERING_DNA, icp: ICP });

    const [call1, call2] = captured;
    const content1 = call1.messages[0].content;
    const content2 = call2.messages[0].content;

    // This identity is the entire point -- Anthropic's prompt caching is a
    // byte-for-byte prefix match. If this segment isn't identical across
    // two different accounts in the same campaign, nothing is ever cached.
    expect(content1[0].text).toBe(content2[0].text);
    expect(content1[0].cache_control).toEqual({ type: "ephemeral" });

    // Neither direction of leakage: no company name in the "stable" half,
    // no offering DNA duplicated into the "volatile" half (that would
    // just be redundant content, not actually excluded from what varies).
    expect(content1[0].text).not.toContain("Acme Corp");
    expect(content1[1].text).toContain("Acme Corp");
    expect(content1[1].text).not.toContain("coreProblem");
    expect(content1[1].cache_control).toBeUndefined();
  });
});

describe("gtm-agent.ts prompt caching", () => {
  it("splits offeringDna (cacheable) from the per-account fields, byte-identical across accounts", async () => {
    mockFetchOnce('{"angle":"x","talkingPoints":[],"draftEmail":null,"draftLinkedIn":null,"callOpener":null}');
    const { runGtmAgent } = await import("./gtm-agent");

    await runGtmAgent({ companyName: "Acme Corp", signals: [], offeringDna: OFFERING_DNA, recommendedTitle: "VP of Ops" });
    await runGtmAgent({ companyName: "Beta Inc", signals: [], offeringDna: OFFERING_DNA, recommendedTitle: "Director of Logistics" });

    const [call1, call2] = captured;
    const content1 = call1.messages[0].content;
    const content2 = call2.messages[0].content;

    expect(content1[0].text).toBe(content2[0].text);
    expect(content1[0].cache_control).toEqual({ type: "ephemeral" });
    expect(content1[0].text).not.toContain("Acme Corp");
    expect(content1[1].text).toContain("Acme Corp");
    expect(content1[1].text).not.toContain("coreProblem");
    expect(content1[1].cache_control).toBeUndefined();
  });
});
