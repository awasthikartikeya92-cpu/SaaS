"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function DeleteCampaignButton({
  campaignId,
  campaignName,
  redirectTo,
  variant = "outline",
  size = "sm",
}: {
  campaignId: string;
  campaignName: string;
  /** Where to navigate after a successful delete -- pass this from the
   *  campaign's own detail page (there's nothing left to show there once
   *  it's gone). Omit from a list page, where router.refresh() removing
   *  the row is enough. */
  redirectTo?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onClick() {
    if (
      !confirm(
        `Delete "${campaignName}"? This removes every account, signal, contact, and report it produced. This can't be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(typeof body?.error === "string" ? body.error : "Couldn't delete this campaign.");
        setDeleting(false);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch {
      alert("Couldn't delete this campaign -- check your connection and try again.");
      setDeleting(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={onClick} disabled={deleting}>
      <Trash2 className="size-4" />
      {deleting ? "Deleting..." : "Delete"}
    </Button>
  );
}
