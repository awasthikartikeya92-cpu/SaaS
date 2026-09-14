import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiCompleteOptions, AiMessage } from "./provider";
import { reportAiUsage } from "./usage-context";

// Bounded well under the generate route's 60s maxDuration (see that file) --
// the pipeline makes several of these calls, some sequential, so a single
// call hanging for the platform's own default (much longer) would still
// eventually get the whole function killed by Vercel with no chance for
// runOrchestrator's catch block to ever run, leaving the campaign stuck at
// "generating" instead of cleanly "failed". Fail this one call fast enough
// that there's still time left in the budget to record it and finish.
//
// 25s (with maxRetries: 1 below) turned out too aggressive in production: a
// real offering-agent call (long system prompt, up to 8192 output tokens)
// legitimately took longer than 25s to finish, which is not a broken call --
// it's just a big generation. 40s gives real completions realistic room.
const REQUEST_TIMEOUT_MS = 40_000;

export class AnthropicProvider implements AiProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;

  // "claude-sonnet-4-6" isn't a real model id -- default to the current
  // Sonnet release. Override with ANTHROPIC_MODEL if you want a different
  // one (e.g. a cheaper/faster model for lower-stakes agents).
  constructor(apiKey: string, model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete({ system, messages, maxTokens = 4096, model }: AiCompleteOptions): Promise<string> {
    const resolvedModel = model ?? this.model;
    const response = await this.client.messages.create(
      {
        model: resolvedModel,
        max_tokens: maxTokens,
        // Every agent's SYSTEM prompt (offering-agent.ts, contact-agent.ts,
        // etc.) is a fixed string literal -- never built per-call with
        // interpolated, request-specific data -- so it's always identical
        // across every call to that agent, for every account, every
        // campaign, every organization. That makes it always safe to mark
        // cacheable unconditionally: worst case (a cold cache) this costs
        // nothing extra, best case (the overwhelmingly common one, given
        // how often these run) it's close to free on every call after the
        // first. See src/lib/ai/provider.ts for the equivalent, opt-in
        // mechanism for per-call message content.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: messages.map(toAnthropicMessage),
      },
      // maxRetries: 0 -- verified against the SDK's own retry logic
      // (node_modules/@anthropic-ai/sdk/client.js): a connection *timeout*
      // is retried unconditionally, independent of the normal 4xx/5xx retry
      // rules, and that retry gets the *same* REQUEST_TIMEOUT_MS budget
      // again. With maxRetries: 1 that silently turned one slow-but-fine
      // response into two full timeout windows back to back (~80s wall
      // clock at the old 40s value) before finally throwing -- this is
      // exactly what produced a raw "Request timed out." failure on a real
      // campaign despite a valid, working API key. Since every agent call
      // already happens inside its own try/catch (logRun) and a single
      // account's failure doesn't sink the campaign (see orchestrator.ts),
      // there's no reliability benefit here worth doubling our exposure to
      // the 60s function budget for -- fail once, fail fast, let the
      // existing failure handling take it from there.
      { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 }
    );

    // Ground-truth token counts from the API response itself -- this is the
    // one thing that's never a guess. See src/lib/billing/pricing-config.ts
    // for how (or whether) this turns into a dollar figure. Reported
    // against resolvedModel (not this.model) so usage/cost breakdowns are
    // accurate when an agent overrode the model per-call.
    reportAiUsage({
      provider: this.name,
      model: resolvedModel,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
  }
}

/**
 * A plain string AiMessage.content maps straight through, unchanged from
 * before this file supported segments at all. An array of segments becomes
 * an array of text content blocks, with cache_control on exactly the
 * segments the caller marked cacheable -- see the AiMessage.content
 * comment in provider.ts for why a segment might be marked that way, and
 * contact-agent.ts/gtm-agent.ts for the two callers that actually do.
 */
function toAnthropicMessage(m: AiMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: m.content.map((segment) => ({
      type: "text",
      text: segment.text,
      ...(segment.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
    })),
  };
}
