import Link from "next/link";
import { auth } from "@/auth";
import { getAllContacts } from "@/lib/db/queries";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function ContactsPage() {
  const session = await auth();
  const contacts = await getAllContacts(session!.user!.organizationId as string);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl">Contacts</h1>
        <p className="text-sm text-ink-soft">Verified decision makers, and recommended titles where no person could be reliably verified.</p>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-ink-soft">No contacts yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name / title</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Relevance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium">{c.name ?? c.title}</p>
                  {c.name && <p className="text-xs text-ink-soft">{c.title}</p>}
                </TableCell>
                <TableCell>
                  <Link href={`/accounts/${c.accountId}`} className="text-ink-soft hover:text-accent">
                    {c.account?.companyName ?? "--"}
                  </Link>
                </TableCell>
                <TableCell>
                  {c.isVerified ? <Badge variant="positive">Verified</Badge> : <Badge variant="neutral">Recommended title</Badge>}
                </TableCell>
                <TableCell className="max-w-xs text-sm text-ink-soft">{c.relevance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
