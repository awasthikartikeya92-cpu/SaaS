import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import {
  LayoutGrid,
  Megaphone,
  Building2,
  Radio,
  Users,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/signals", label: "Signals", icon: Radio },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-paper-raised">
        <div className="flex h-14 items-center px-5">
          <span className="font-[var(--font-display)] text-lg">SignalIQ</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="mb-2 px-3 text-xs text-ink-soft">{session.user?.email}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
