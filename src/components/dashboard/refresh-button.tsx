"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  function onClick() {
    startTransition(() => {
      router.refresh();
    });
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 1500);
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
      {isPending ? "Refreshing..." : justRefreshed ? "Refreshed" : "Refresh"}
    </Button>
  );
}
