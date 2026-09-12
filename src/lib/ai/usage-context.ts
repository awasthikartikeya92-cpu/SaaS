// Propagates "which org/campaign/agent is this AI call for" down into the
// provider layer without threading an extra parameter through every agent
// function signature. The orchestrator opens a context per pipeline stage
// (see runOrchestrator's logRun); whichever provider.complete() call runs
// inside that stage reports its usage against that context automatically.
//
// Nothing in this file talks to a database -- it doesn't know what "record
// usage" means. That's registered separately via setAiUsageSink so this
// module has no dependency on Drizzle/schema, and a script that calls an
// agent directly (no orchestrator, no context) fails loud via the
// console.warn below instead of silently losing cost data.
import { AsyncLocalStorage } from "node:async_hooks";

export interface AiUsageContext {
  organizationId: string;
  campaignId: string;
  agent: string;
}

export interface AiUsageEvent extends AiUsageContext {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const storage = new AsyncLocalStorage<AiUsageContext>();

export function withAiUsageContext<T>(ctx: AiUsageContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getAiUsageContext(): AiUsageContext | undefined {
  return storage.getStore();
}

type AiUsageSink = (event: AiUsageEvent) => void | Promise<void>;
let sink: AiUsageSink | null = null;

/** Called once at startup (see src/lib/agents/orchestrator.ts) to wire usage events to storage. */
export function setAiUsageSink(fn: AiUsageSink): void {
  sink = fn;
}

/** Called by each AiProvider implementation after a completion returns. */
export function reportAiUsage(call: Omit<AiUsageEvent, keyof AiUsageContext>): void {
  const ctx = getAiUsageContext();
  if (!ctx) {
    console.warn("[ai-usage] no usage context active -- usage event dropped:", call);
    return;
  }
  const event: AiUsageEvent = { ...ctx, ...call };
  if (!sink) {
    console.warn("[ai-usage] no usage sink registered -- usage event dropped:", event);
    return;
  }
  void Promise.resolve(sink(event)).catch((err) => {
    console.error("[ai-usage] failed to record usage event:", err, event);
  });
}
