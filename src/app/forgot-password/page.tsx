"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The API always returns the same generic message regardless of outcome
  // (see /api/auth/forgot-password's own comment on why) -- this page just
  // displays exactly that message once the request completes, rather than
  // trying to distinguish success from "no such account" itself.
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      setMessage(
        res.ok
          ? (body?.message ?? "If an account exists for that email, a reset link has been sent.")
          : (body?.error ?? "Something went wrong. Please try again.")
      );
    } catch {
      setMessage("Couldn't reach the server -- check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-[var(--font-display)] text-2xl">SignalIQ</p>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {message ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink">{message}</p>
              <Link href="/login" className="text-sm text-accent underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-ink-soft">
                Enter the email on your account and we&apos;ll send you a link to reset your password.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" variant="accent" disabled={submitting}>
                {submitting ? "Sending..." : "Send reset link"}
              </Button>
              <p className="text-xs text-ink-soft">
                <Link href="/login" className="underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
