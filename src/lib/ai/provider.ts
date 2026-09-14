// AI provider abstraction. The rest of the app (agents) only ever talks to
// this interface -- never to a specific vendor SDK -- so swapping Anthropic
// for OpenAI or another provider is a config change (AI_PROVIDER env var),
// not a rewrite.

export interface AiMessage {
  role: "user" | "assistant";
  /**
   * A plain string (the common case) -- or, when part of the message is
   * worth marking cacheable, an ordered list of segments concatenated
   * together to form the same content. A segment's `cacheable: true`
   * means "this exact text repeats across many calls" (e.g. the same
   * Offering DNA/ICP reused for every account in one campaign -- see
   * contact-agent.ts/gtm-agent.ts). A provider that supports server-side
   * prompt caching (Anthropic) places a cache breakpoint right after the
   * last such segment; a provider that doesn't (OpenAI's caching is
   * automatic, no API-level marker needed) just ignores the flag and
   * concatenates every segment into one string -- see openai-provider.ts.
   * Segment order is preserved either way, so this never changes what the
   * model actually reads, only whether part of it can be cached.
   */
  content: string | AiContentSegment[];
}

export interface AiContentSegment {
  text: string;
  cacheable?: boolean;
}

export interface AiCompleteOptions {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** When set, the provider is asked to return JSON matching this shape description. */
  jsonMode?: boolean;
  /**
   * Per-call model override. Falls back to the provider's own default when
   * unset. Agents should normally pass this via getModelForAgent()
   * (src/lib/ai/model-config.ts) rather than hardcoding a model string, so
   * "which agent uses which model" stays in one place.
   */
  model?: string;
}

export interface AiProvider {
  name: string;
  complete(options: AiCompleteOptions): Promise<string>;
}
