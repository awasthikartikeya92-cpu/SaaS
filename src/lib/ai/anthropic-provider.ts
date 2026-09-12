import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiCompleteOptions } from "./provider";

export class AnthropicProvider implements AiProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete({ system, messages, maxTokens = 4096 }: AiCompleteOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : "";
  }
}
