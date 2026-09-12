import Link from "next/link";
import { auth } from "@/auth";
import { getAllSignals } from "@/lib/db/queries";
import { Card, CardContent } from "@/components/ui/card";
import { TierBadge, ConfidenceBadge } from "@/components/dashboard/tier-badge";
import { formatDate } from "@/lib/utils";

export default async function SignalsPage() {
  const session = await auth();
  const signals = await getAllSignals(session!.user!.organizationId as string);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Signals</h1>
        <p className="text-sm text-ink-soft">Chronological feed of newly discovered public signals, most recent first.</p>
      </div>

      {signals.length === 0 ? (
        <p className="text-sm text-ink-soft">No signals recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {signals.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-2 pt-5">
                <div className="flex items-center justify-between">
                  <Link href={`/accounts/${s.accountId}`} className="text-sm font-medium hover:text-accent">
                    {s.account?.companyName ?? "Unknown company"}
                  </Link>
                  <span className="text-xs text-ink-soft">{formatDate(s.detectedAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TierBadge tier={s.tier} />
                  <ConfidenceBadge confidence={s.confidence} verified={s.verified} />
                </div>
                <p className="text-sm text-ink-soft">{s.evidence}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
