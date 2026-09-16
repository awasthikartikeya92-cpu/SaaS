import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared shell for all four auth pages (login, signup, forgot-password,
 * reset-password) -- before this each one hand-rolled its own centered
 * card with the same "SignalIQ" wordmark repeated as plain text, so a
 * change to one (like the brand mark added to the dashboard sidebar) never
 * matched the others. This is the one place that owns the first
 * impression of the product for a signed-out visitor.
 */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_50%_0%,var(--accent-soft),transparent_70%)]"
      />
      <Card className="relative w-full max-w-sm shadow-lg">
        <CardHeader className="items-center gap-3 pb-2 text-center">
          <span className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] bg-ink font-[var(--font-display)] text-base text-paper">
            S
          </span>
          <span className="font-[var(--font-display)] text-xl text-ink">SignalIQ</span>
          <CardTitle className="pt-1 text-base font-medium text-ink">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
