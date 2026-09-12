"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UpgradeButton({ planId, label }: { planId: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.url) {
      setError(typeof body?.error === "string" ? body.error : "Couldn't start checkout.");
      setLoading(false);
      return;
    }
    window.location.href = body.url;
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="accent" size="sm" onClick={onClick} disabled={loading}>
        {loading ? "Redirecting..." : label}
      </Button>
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
