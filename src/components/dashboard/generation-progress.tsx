"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GenerationProgress as Progress } from "@/lib/db/queries";

// How long to wait between step calls when there's no error -- each call
// already takes real wall-clock time (a research/verification pass, or an
// LLM call up to 40s -- see src/lib/ai/anthropic-provider.ts), so this is
// just a floor to avoid hammering the server on the rare step that returns
// almost instantly (e.g. the very last "nothing left to do, mark active"
// call).
const POLL_DELAY_MS = 400;
const MAX_CONSECUTIVE_ERRORS = 5;

const STAGES: { key: "offering" | "icp" | "signal" | "research" | "accounts"; label: string }[] = [
  { key: "offering", label: "Offering DNA" },
  { key: "icp", label: "ICP" },
  { key: "signal", label: "Signal taxonomy" },
  { key: "research", label: "Research" },
  { key: "accounts", label: "Accounts" },
];

function stageState(progress: Progress, key: (typeof STAGES)[number]["key"]): "done" | "active" | "pending" {
  if (key === "accounts") {
    if (progress.stage === "complete") return "done";
    if (progress.stage === "accounts") return "active";
    return "pending";
  }
  const raw = progress.stages[key];
  if (raw === "success") return "done";
  if (progress.stage === key) return "active";
  return "pending";
}

/**
 * Drives and displays a campaign's resumable generation. Mounted on the
 * campaign page whenever the campaign isn't in a terminal state yet
 * (draft/generating) -- it repeatedly calls POST /api/campaigns/[id]/step,
 * each call doing exactly one bounded unit of work, and shows real progress
 * (which stage, how many accounts done) instead of a static spinner. See
 * src/lib/agents/orchestrator.ts for why generation is structured this way.
 */
export function GenerationProgress({ campaignId, initial }: { campaignId: string; initial: Progress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    // Guards against React StrictMode's dev-only double effect invocation
    // starting two overlapping polling loops from the same mount. A second
    // loop from another source entirely (a second browser tab on the same
    // campaign) is handled server-side instead -- see stageGate() in
    // orchestrator.ts.
    if (startedRef.current) return;
    startedRef.current = true;

    async function tick() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/step`, { method: "POST" });
        if (!res.ok) throw new Error(`step failed (${res.status})`);
        const data: Progress = await res.json();
        consecutiveErrorsRef.current = 0;
        setConnectionError(null);
        setProgress(data);

        if (data.campaignStatus === "active" || data.campaignStatus === "failed") {
          // Swap into the full server-rendered view (tabs, final scores,
          // or the failure card) -- this component's job is done.
          router.refresh();
          return;
        }
        timeoutRef.current = setTimeout(tick, POLL_DELAY_MS);
      } catch {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current > MAX_CONSECUTIVE_ERRORS) {
          setConnectionError("Lost connection while generating. Your progress is saved -- reload the page to keep going.");
          return;
        }
        // Backoff on connection trouble specifically (not a pipeline
        // failure -- that comes back as a normal 200 with campaignStatus
        // "failed" and is handled above, not here).
        timeoutRef.current = setTimeout(tick, 1500 * consecutiveErrorsRef.current);
      }
    }

    tick();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // Intentionally runs once per mount: campaignId is stable for the life
    // of this page, and router is a stable singleton from next/navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((s, i) => {
            const state = stageState(progress, s.key);
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    state === "done" && "bg-tier-3-soft text-positive",
                    state === "active" && "bg-accent-soft text-accent",
                    state === "pending" && "bg-line/60 text-ink-soft"
                  )}
                >
                  {state === "done" && <Check className="size-3.5" />}
                  {state === "active" && <Loader2 className="size-3.5 animate-spin" />}
                  {s.label}
                </div>
                {i < STAGES.length - 1 && <div className="h-px w-3 bg-line" />}
              </div>
            );
          })}
        </div>

        {progress.stage === "accounts" && progress.accountsTotal > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-ink-soft">
              Processing accounts -- {progress.accountsDone} of {progress.accountsTotal} complete
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.max(4, (progress.accountsDone / progress.accountsTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {connectionError ? (
          <p className="text-sm text-negative">{connectionError}</p>
        ) : (
          <p className="text-xs text-ink-soft">
            This runs as a series of short steps rather than one long request, so it&apos;s normal for this to take a
            few minutes on a campaign with several accounts. You can leave this page and come back -- progress is
            saved after every step.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
