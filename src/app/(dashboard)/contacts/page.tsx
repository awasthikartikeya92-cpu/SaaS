import { redirect } from "next/navigation";

// Same as accounts/page.tsx's own comment: this used to be a cross-campaign
// contact list, blended across every campaign in the org. Each campaign's
// own contacts now live on its Contacts tab (/campaigns/[id]#contacts)
// instead of a global page.
export default function ContactsIndexPage() {
  redirect("/campaigns");
}
