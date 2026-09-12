import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCORING_WEIGHTS } from "@/lib/scoring";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Settings</h1>
        <p className="text-sm text-ink-soft">Organization, credentials, and scoring configuration.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>AI & research providers</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-ink-soft">
          <p>AI provider: <span className="font-[var(--font-data)] text-ink">{process.env.AI_PROVIDER ?? "anthropic"}</span></p>
          <p>Research provider: <span className="font-[var(--font-data)] text-ink">{process.env.RESEARCH_PROVIDER ?? "mock"}</span></p>
          <p className="text-xs">
            Credential storage (BYOK) and per-org provider switching are a Phase 4 deliverable -- for now, providers
            are set via server environment variables.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scoring weights</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>ICP fit: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.icpFit * 100}%</span></p>
          <p>Intent: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.intent * 100}%</span></p>
          <p>Reachability: <span className="font-[var(--font-data)]">{SCORING_WEIGHTS.reachability * 100}%</span></p>
          <p className="text-xs text-ink-soft">Read-only in Phase 1. Configurable weights are a Phase 4 deliverable.</p>
        </CardContent>
      </Card>
    </div>
  );
}
