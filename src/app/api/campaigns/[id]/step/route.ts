import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runNextStep } from "@/lib/agents/orchestrator";
import { getOwnedCampaign } from "@/lib/db/queries";
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

  // Authenticated only proves *a* valid session -- not that this session's
  // org owns campaign `id`. Without this, any signed-in user could drive
  // (and pay for, via the shared Anthropic key) generation on any other
  // org's campaign by guessing/enumerating its id, and read back that org's
  // company names and failure details in the response. 404, not 403: this
  // shouldn't confirm to a stranger that the id exists at all.
  const owned = await getOwnedCampaign(id, session.user!.organizationId as string);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Whether this campaign was ALREADY terminal before this call --
  // runNextStep() is safe to call again on a terminal campaign (it's a
  // no-op that just re-reports current progress, see its own comment), but
  // without this check a stray/duplicate poll after the client has already
  // seen "active"/"failed" would re-fire the success/failure event every
  // single time it's called again, not just on the one real transition.
  const wasAlreadyTerminal = owned.status === "active" || owned.status === "failed";

  try {
    const progress = await runNextStep(id);
    if (!wasAlreadyTerminal) {
      if (progress.campaignStatus === "active" && progress.stage === "complete") {
        await track("campaign_generate_succeeded", { campaignId: id, organizationId: owned.organizationId });
      } else if (progress.campaignStatus === "failed") {
        await track("campaign_generate_failed", {
          campaignId: id,
          organizationId: owned.organizationId,
          error: progress.lastError ?? "unknown",
        });
      }
    }
    return NextResponse.json(progress);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
