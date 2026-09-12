import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runNextStep } from "@/lib/agents/orchestrator";
import { track } from "@/lib/analytics/track";

// This is called repeatedly -- the campaign page polls it every couple of
// seconds while a campaign is generating -- and each call does exactly ONE
// bounded unit of work (one agent call, essentially) rather than the whole
// pipeline. That's the fix for campaigns racing Vercel's function timeout
// (60s on Hobby, with no way to raise it): no single call here ever
// attempts more than one real LLM request, so there's nothing for a
// platform timeout to interrupt mid-pipeline. See
// src/lib/agents/orchestrator.ts and docs/launch-checklist.md.
//
// 45s, not 60s: comfortably above the Anthropic provider's own 40s
// per-request timeout (src/lib/ai/anthropic-provider.ts) plus DB round
// trips, but there's no reason to claim the platform's full ceiling for a
// single step that should never need it.
export const maxDuration = 45;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const progress = await runNextStep(id);
    if (progress.campaignStatus === "active" && progress.stage === "complete") {
      track("campaign_generate_succeeded", { campaignId: id });
    } else if (progress.campaignStatus === "failed") {
      track("campaign_generate_failed", { campaignId: id, error: progress.lastError ?? "unknown" });
    }
    return NextResponse.json(progress);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
