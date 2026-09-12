import { cn } from "@/lib/utils";

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full", value >= 70 ? "bg-tier-1" : value >= 45 ? "bg-tier-2" : "bg-tier-3")}
          style={{ width: `${Math.max(4, value)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-[var(--font-data)] text-xs text-ink">{value.toFixed(0)}</span>
    </div>
  );
}

export function OpportunityScore({ value }: { value: number }) {
  const color = value >= 70 ? "text-tier-1" : value >= 45 ? "text-tier-2" : "text-tier-3";
  return (
    <span className={cn("font-[var(--font-data)] text-2xl font-medium", color)}>{value.toFixed(0)}</span>
  );
}
