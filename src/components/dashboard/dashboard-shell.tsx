"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Megaphone,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Accounts/Signals/Contacts used to be global, org-wide pages here --
// removed along with their org-wide queries once a campaign became the
// unit of analysis (see /overview and /campaigns/[id]'s own comments):
// each campaign's own accounts/signals/contacts now live as tabs on that
// campaign's dashboard instead of a separate cross-campaign page.
const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

// An account's own detail page lives at /accounts/[id], reached only by
// drilling into a campaign -- it isn't its own nav destination (the old
// /accounts index is gone), so it should still light up "Campaigns" rather
// than leaving the whole sidebar looking un-navigated.
function isNavActive(pathname: string, href: string) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === "/campaigns" && pathname.startsWith("/accounts")) return true;
  return false;
}

/**
 * The dashboard's navigation shell. Below `md`, the 224px sidebar used to
 * just... stay there -- on a 390px phone it ate more than half the screen,
 * permanently, on every single dashboard page. There was no mobile
 * treatment at all.
 *
 * Below `md`, this becomes a slide-in drawer (off-canvas by default,
 * opened by a hamburger button in a mobile-only top bar) instead of a
 * permanent column; at `md` and up it's the original always-visible
 * sidebar, unchanged. Client component specifically for the open/close
 * state -- the auth check and the sign-out server action stay in
 * layout.tsx (a Server Component), passed in as props/children, so this
 * file owns only the interaction, not the session.
 */
export function DashboardShell({
  userEmail,
  onSignOut,
  children,
}: {
  userEmail: string;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    // Lock background scroll and allow Escape to close while the drawer is
    // open -- it visually covers the page like a modal, so it should
    // behave like one.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-paper-raised px-4 shadow-xs md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-[var(--radius-sm)] p-2 text-ink-soft hover:bg-paper hover:text-ink"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-paper-raised shadow-lg transition-transform duration-200 md:shadow-none",
          "md:static md:z-auto md:w-56 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between px-5 md:justify-start">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-[var(--radius-sm)] p-2 text-ink-soft hover:bg-paper hover:text-ink md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-soft hover:bg-paper hover:text-ink"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2.5 px-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-paper">
              {userEmail.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-xs text-ink-soft">
              <p className="truncate">{userEmail}</p>
            </div>
          </div>
          <form action={onSignOut}>
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
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-ink font-[var(--font-display)] text-sm text-paper">
        S
      </span>
      <span className="font-[var(--font-display)] text-lg">SignalIQ</span>
    </span>
  );
}
