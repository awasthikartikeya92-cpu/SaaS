// Per-agent model selection. Not every agent call carries the same stakes:
//
// - Offering / ICP / Signal run once per campaign and everything downstream
//   (every account's scoring, every piece of outreach) inherits their
//   output -- a bad Offering DNA or a shallow ICP quietly degrades the
//   whole campaign, so quality matters more than cost here.
// - GTM runs once per *account*, but it's the actual outreach content a
//   user copies into a real email or LinkedIn message -- the one place
//   where "cheaper but slightly worse" is directly visible to the person
//   using the product.
// - Contact also runs once per account (so its cost scales with account
//   count the same way GTM's does), but it's picking a job title from a
//   fairly narrow, well-known set of patterns and never invents a person
//   -- a cheaper/faster model is a good trade here, not a quality cut.
//
// Override either tier with an env var to tune this without a code change
// once real per-agent cost data exists (src/lib/billing/usage-tracking.ts).
// ANTHROPIC_MODEL, if set, is a full blanket override -- every agent uses
// it and the strong/fast split below is skipped entirely (for anyone who
// wants the old single-model behavior back).
// `||` throughout, not `??`: an env var set to an empty string (easy to end
// up with pasting a .env file into a dashboard) must fall back to the
// default too, the same as if it were unset.
const BLANKET_OVERRIDE = process.env.ANTHROPIC_MODEL || undefined;
const STRONG_MODEL = BLANKET_OVERRIDE || process.env.ANTHROPIC_MODEL_STRONG || "claude-sonnet-5";
const FAST_MODEL = BLANKET_OVERRIDE || process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001";

// Keys must match the agent name strings used in src/lib/agents/orchestrator.ts's
// logRun() calls -- that's also what usage/cost breakdowns are grouped by.
const AGENT_MODELS: Record<string, string> = {
  "offering-agent": STRONG_MODEL,
  "icp-agent": STRONG_MODEL,
  "signal-agent": STRONG_MODEL,
  "gtm-agent": STRONG_MODEL,
  "contact-agent": FAST_MODEL,
};

export function getModelForAgent(agent: keyof typeof AGENT_MODELS): string {
  return AGENT_MODELS[agent] ?? STRONG_MODEL;
}
