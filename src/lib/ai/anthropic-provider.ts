import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiCompleteOptions } from "./provider";
import { reportAiUsage } from "./usage-context";

// Bounded well under the generate route's 60s maxDuration (see that file) --
// the pipeline makes several of these calls, some sequential, so a single
// call hanging for the platform's own default (much longer) would still
// eventually get the whole function killed by Vercel with no chance for
// runOrchestrator's catch block to ever run, leaving the campaign stuck at
// "generating" instead of cleanly "failed". Fail this one call fast enough
// that there's still time left in the budget to record it and finish.
const REQUEST_TIMEOUT_MS = 25_000;

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
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }
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
