"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function NewCampaignPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    website: "",
    problemsSolved: "",
    outcomes: "",
    differentiators: "",
    targetIndustries: "",
    targetGeographies: "",
    targetCompanySize: "",
    knownIcp: "",
    knownPersonas: "",
    competitors: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetIndustries: form.targetIndustries.split(",").map((s) => s.trim()).filter(Boolean),
          targetGeographies: form.targetGeographies.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = await res.json();
      // Fire-and-forget: kick off the agent pipeline, then go to the campaign page.
      fetch(`/api/campaigns/${id}/generate`, { method: "POST" });
      router.push(`/campaigns/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-[var(--font-display)] text-2xl">New campaign</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Describe the offering in your own words -- the Offering, ICP, and Signal agents turn this
        into structured intelligence.
      </p>
      <Card>
        <CardHeader><CardTitle>Offering details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field label="Product / service name">
              <Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ridgeline Ops Platform" />
            </Field>
            <Field label="Website" optional>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Problems solved">
              <Textarea required rows={3} value={form.problemsSolved} onChange={(e) => set("problemsSolved", e.target.value)} />
            </Field>
            <Field label="Business outcomes">
              <Textarea required rows={3} value={form.outcomes} onChange={(e) => set("outcomes", e.target.value)} />
            </Field>
            <Field label="Differentiators">
              <Textarea required rows={3} value={form.differentiators} onChange={(e) => set("differentiators", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Target industries (comma-separated)">
                <Input required value={form.targetIndustries} onChange={(e) => set("targetIndustries", e.target.value)} placeholder="Logistics, Retail" />
              </Field>
              <Field label="Target geographies (comma-separated)">
                <Input required value={form.targetGeographies} onChange={(e) => set("targetGeographies", e.target.value)} placeholder="US, Canada" />
              </Field>
            </div>
            <Field label="Target company size" optional>
              <Input value={form.targetCompanySize} onChange={(e) => set("targetCompanySize", e.target.value)} placeholder="e.g. 200-2000 employees" />
            </Field>
            <Field label="Known ICP" optional>
              <Textarea rows={2} value={form.knownIcp} onChange={(e) => set("knownIcp", e.target.value)} />
            </Field>
            <Field label="Known buyer personas" optional>
              <Textarea rows={2} value={form.knownPersonas} onChange={(e) => set("knownPersonas", e.target.value)} />
            </Field>
            <Field label="Competitors" optional>
              <Input value={form.competitors} onChange={(e) => set("competitors", e.target.value)} />
            </Field>

            {error && <p className="text-sm text-negative">{error}</p>}

            <Button type="submit" variant="accent" disabled={submitting}>
              {submitting ? "Creating..." : "Create campaign"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label} {optional && <span className="font-normal text-ink-soft">(optional)</span>}
      </Label>
      {children}
    </div>
  );
}
