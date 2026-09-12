import type { AiProvider, AiCompleteOptions } from "./provider";

// Stub adapter -- Phase 1 ships Anthropic only. Filling this in when a
// second provider is needed is the whole point of the interface: implement
// `complete()` against the OpenAI SDK and register it in `index.ts` below.
export class OpenAiProvider implements AiProvider {
  name = "openai";
  constructor(private apiKey: string) {}

  async complete(_options: AiCompleteOptions): Promise<string> {
    throw new Error("OpenAI provider not yet implemented. Set AI_PROVIDER=anthropic for now.");
  }
}
