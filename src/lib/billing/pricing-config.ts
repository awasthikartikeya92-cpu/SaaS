// Per-model $ cost, used to turn raw token counts (ground truth, from the
// provider's API response) into an estimated dollar figure. This table
// ships EMPTY on purpose: I don't have confident, current pricing for the
// models this app might run against, and a wrong number here is worse than
// no number -- it would quietly corrupt whatever pricing/margin decision
// it feeds into. Fill this in from https://www.anthropic.com/pricing (or
// your provider's current pricing page) once you've picked which model(s)
// the pipeline runs on, and re-check it whenever pricing changes.
//
// Until an entry exists for a given model, estimateCostUsd() returns null
// and callers should show/store "cost unknown" rather than 0 -- 0 reads as
// "this was free," which is never true and would hide real spend.
export const MODEL_PRICING_USD_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  // "claude-sonnet-5": { input: 0, output: 0 }, // TODO: fill in from the pricing page
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const rate = MODEL_PRICING_USD_PER_MILLION_TOKENS[model];
  if (!rate) return null;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
