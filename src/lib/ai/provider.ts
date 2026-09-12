// AI provider abstraction. The rest of the app (agents) only ever talks to
// this interface -- never to a specific vendor SDK -- so swapping Anthropic
// for OpenAI or another provider is a config change (AI_PROVIDER env var),
// not a rewrite.

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiCompleteOptions {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** When set, the provider is asked to return JSON matching this shape description. */
  jsonMode?: boolean;
}

export interface AiProvider {
  name: string;
  complete(options: AiCompleteOptions): Promise<string>;
}
