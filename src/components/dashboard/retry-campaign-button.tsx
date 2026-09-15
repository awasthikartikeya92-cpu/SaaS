"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Replaces the old RefreshButton, which only ever did router.refresh() (a
 * page reload) -- honest-but-useless on a failed campaign, since nothing
 * about "failed" changes on its own. This one does real work: POST
 * /api/campaigns/[id]/retry flips the campaign back to "generating" (safe
 * to do after any failure -- see that route's comment on why), then
 * router.refresh() re-renders this page from the database. Because the
 * campaign is "generating" now, the page's own stillGenerating check
 * renders <GenerationProgress> instead of this failure card, and that
 * component starts polling POST /step on mount -- which resumes exactly at
 * the stage that failed (already-succeeded stages are skipped, not
 * repeated; see decideStageAction in stage-decision.ts).
 */
export function RetryCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Couldn't retry this campaign.");
      }
      router.refresh();
      // Left true deliberately -- the refresh above swaps this whole card
      // out for <GenerationProgress> once the server sees "generating", so
      // there's no stale "Retry" button left behind to reset.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't retry this campaign -- check your connection and try again.");
      setRetrying(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={onClick} disabled={retrying}>
        <RefreshCw className={retrying ? "size-4 animate-spin" : "size-4"} />
        {retrying ? "Retrying..." : "Retry generation"}
      </Button>
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
