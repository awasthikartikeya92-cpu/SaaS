import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { track } from "@/lib/analytics/track";

// Without this, Vercel kills the function at its platform default (10s on
// Hobby) once real accounts replace the 6 fixed mock ones -- the pipeline
// runs several sequential LLM calls plus one per discovered account, which
// easily exceeds that. The function being killed mid-flight is worse than
// a clean failure: it never reaches runOrchestrator's own catch block, so
// the campaign is left stuck at "generating" forever instead of becoming
// "failed" with a real error message. 60 is Hobby's own ceiling (Vercel
// clamps to it regardless of what's set here); raise this if you're on Pro
// and still seeing campaigns run out of time on a large discovered-account
// universe -- see docs/launch-checklist.md.
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Intentionally not awaited by the caller (the UI fires this and navigates
  // straight to the campaign page) -- but we do await it here so errors are
  // logged to the research_runs table via the orchestrator's own try/catch,
  // rather than becoming an unhandled rejection.
  track("campaign_generate_started", { campaignId: id });
  try {
    await runOrchestrator(id);
    track("campaign_generate_succeeded", { campaignId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    track("campaign_generate_failed", { campaignId: id, error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
