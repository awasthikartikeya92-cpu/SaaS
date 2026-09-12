import { Badge } from "@/components/ui/badge";

export function TierBadge({ tier }: { tier: number }) {
  const variant = tier === 1 ? "tier1" : tier === 2 ? "tier2" : "tier3";
  const label = tier === 1 ? "Tier 1 - direct" : tier === 2 ? "Tier 2 - indirect" : "Tier 3 - contextual";
  return <Badge variant={variant as "tier1" | "tier2" | "tier3"}>{label}</Badge>;
}

export function ConfidenceBadge({ confidence, verified }: { confidence: number; verified: boolean }) {
  if (!verified) return <Badge variant="neutral">Not verified</Badge>;
  const pct = Math.round(confidence * 100);
  return <Badge variant={pct >= 70 ? "positive" : "neutral"}>{pct}% confidence</Badge>;
}
