// The DB-backed implementation of the AI usage sink declared in
// src/lib/ai/usage-context.ts. Kept separate from that module so the
// context/propagation mechanism has zero dependency on Drizzle -- this file
// is the only place that writes ai_usage_events rows.
import { db } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";
import type { AiUsageEvent } from "@/lib/ai/usage-context";
import { estimateCostUsd } from "./pricing-config";

export async function recordAiUsageEvent(event: AiUsageEvent): Promise<void> {
  await db.insert(aiUsageEvents).values({
    organizationId: event.organizationId,
    campaignId: event.campaignId,
    agent: event.agent,
    provider: event.provider,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    estimatedCostUsd: estimateCostUsd(event.model, event.inputTokens, event.outputTokens),
  });
}

export interface UsageSummary {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Null when any included row has an unpriced model -- see pricing-config.ts. */
  estimatedCostUsd: number | null;
}

/** Per-agent token/cost breakdown for one campaign -- what actually costs money in a single generate run. */
export async function getCampaignUsage(campaignId: string): Promise<UsageSummary[]> {
  const rows = await db
    .select()
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.campaignId, campaignId));
  return summarizeByAgent(rows);
}

/** Org-wide usage since the start of the current calendar month -- the number a plan/quota decision should look at. */
export async function getOrganizationUsageThisPeriod(organizationId: string): Promise<UsageSummary[]> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.organizationId, organizationId), gte(aiUsageEvents.createdAt, periodStart)));
  return summarizeByAgent(rows);
}

function summarizeByAgent(rows: (typeof aiUsageEvents.$inferSelect)[]): UsageSummary[] {
  const byAgent = new Map<string, UsageSummary>();
  for (const row of rows) {
    const existing = byAgent.get(row.agent) ?? {
      agent: row.agent,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
    existing.calls += 1;
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.estimatedCostUsd =
      existing.estimatedCostUsd === null || row.estimatedCostUsd === null
        ? null
        : existing.estimatedCostUsd + row.estimatedCostUsd;
    byAgent.set(row.agent, existing);
  }
  return [...byAgent.values()];
}
