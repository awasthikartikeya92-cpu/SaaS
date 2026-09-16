import { redirect } from "next/navigation";

// This used to be a cross-campaign account list, blended across every
// campaign in the org -- removed once a campaign became the unit of
// analysis (see /overview and /campaigns/[id]'s own comments). Each
// campaign's own accounts now live on its Accounts tab
// (/campaigns/[id]#accounts) instead of a global page. /accounts/[id]
// (a single account's own detail page) is untouched -- only this list is
// gone. Redirects rather than 404s since this was a real, bookmarked nav
// item until this change.
export default function AccountsIndexPage() {
  redirect("/campaigns");
}
