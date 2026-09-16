import { redirect } from "next/navigation";

// Same as accounts/page.tsx's own comment: this used to be a cross-campaign
// signal feed, blended across every campaign in the org. Each campaign's
// own detected-signal feed now lives on its Signals tab
// (/campaigns/[id]#signals) instead of a global page.
export default function SignalsIndexPage() {
  redirect("/campaigns");
}
