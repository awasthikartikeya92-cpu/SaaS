import Link from "next/link";
import { auth } from "@/auth";
import { getDashboardData } from "@/lib/db/queries";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { OpportunityScore } from "@/components/dashboard/score-bar";

export default async function AccountsPage() {
  const session = await auth();
  const data = await getDashboardData(session!.user!.organizationId as string);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Accounts</h1>
        <p className="text-sm text-ink-soft">{data.accounts.length} accounts across all campaigns</p>
      </div>

      {data.accounts.length === 0 ? (
        <p className="text-sm text-ink-soft">No accounts yet -- create and generate a campaign first.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="text-right">ICP fit</TableHead>
              <TableHead className="text-right">Intent</TableHead>
              <TableHead className="text-right">Reachability</TableHead>
              <TableHead className="text-right">Opportunity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Link href={`/accounts/${a.id}`} className="font-medium hover:text-accent">{a.companyName}</Link></TableCell>
                <TableCell className="text-ink-soft">{a.industry ?? "--"}</TableCell>
                <TableCell className="text-right font-[var(--font-data)]">{a.score?.icpFit.toFixed(0) ?? "--"}</TableCell>
                <TableCell className="text-right font-[var(--font-data)]">{a.score?.intent.toFixed(0) ?? "--"}</TableCell>
                <TableCell className="text-right font-[var(--font-data)]">{a.score?.reachability.toFixed(0) ?? "--"}</TableCell>
                <TableCell className="text-right"><OpportunityScore value={a.score?.opportunity ?? 0} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
