import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiCompleteOptions } from "./provider";
import { reportAiUsage } from "./usage-context";

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
    const response = await this.client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

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
