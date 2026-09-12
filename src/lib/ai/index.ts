import type { AiProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAiProvider } from "./openai-provider";

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;

  // `||` on purpose, not `??` -- an env var set to an empty string (easy to
  // end up with when pasting a .env file into a dashboard) should fall
  // back to the default too, not be treated as a deliberate empty value.
  const providerName = process.env.AI_PROVIDER || "anthropic";

  if (providerName === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
    cached = new AnthropicProvider(key);
  } else if (providerName === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set.");
    cached = new OpenAiProvider(key);
  } else {
    throw new Error(`Unknown AI_PROVIDER: ${providerName}`);
  }

  return cached;
}

export type { AiProvider, AiMessage, AiCompleteOptions } from "./provider";
