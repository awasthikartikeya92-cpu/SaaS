import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { DeleteCampaignButton } from "@/components/dashboard/delete-campaign-button";

export default async function CampaignsPage() {
  const session = await auth();
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, session!.user!.organizationId as string))
    .orderBy(desc(campaigns.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl">Campaigns</h1>
          <p className="text-sm text-ink-soft">Each campaign is one offering and its account universe.</p>
        </div>
        <Button asChild variant="accent"><Link href="/campaigns/new">New campaign</Link></Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-line-strong py-16 text-center text-sm text-ink-soft">
          No campaigns yet -- create one to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Industries</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">&nbsp;</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-ink-soft">{c.targetIndustries.join(", ")}</TableCell>
                <TableCell className="text-ink-soft">{formatDate(c.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <DeleteCampaignButton campaignId={c.id} campaignName={c.name} variant="ghost" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "active" ? "positive" : status === "generating" ? "accent" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}
