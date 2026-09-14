import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { z } from "zod";
import { assertCanCreateCampaign, QuotaExceededError } from "@/lib/billing/quota";
import { track } from "@/lib/analytics/track";

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  problemsSolved: z.string().min(1),
  outcomes: z.string().min(1),
  differentiators: z.string().min(1),
  targetIndustries: z.array(z.string()).min(1),
  targetGeographies: z.array(z.string()).min(1),
  targetCompanySize: z.string().optional(),
  knownIcp: z.string().optional(),
  knownPersonas: z.string().optional(),
  competitors: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const organizationId = session.user!.organizationId as string;

  try {
    await assertCanCreateCampaign(organizationId);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await track("quota_blocked", { organizationId, planId: err.planId });
      return NextResponse.json(
        { error: err.message, planId: err.planId, limit: err.limit, used: err.used },
        { status: 402 }
      );
    }
    throw err;
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      organizationId,
      ...parsed.data,
    })
    .returning();

  await track("campaign_created", { organizationId, campaignId: campaign.id });

  return NextResponse.json({ id: campaign.id });
}
