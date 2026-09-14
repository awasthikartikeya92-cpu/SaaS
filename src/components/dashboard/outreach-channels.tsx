"use client";

import { useState } from "react";
import { Mail, MessageCircle, Phone, Copy, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Channel {
  key: "email" | "linkedin" | "call";
  label: string;
  /** Shown below the `sm` breakpoint instead of `label` -- at a 390px
   *  viewport, "Email" + "LinkedIn" + "Call opener" together don't quite
   *  fit the card's content width without wrapping or clipping. Shortening
   *  the one long label is simpler and more honest than a horizontal
   *  scroll container for three short tabs, which would clip content at
   *  the edge with no visual hint that there's more to scroll to. */
  shortLabel?: string;
  icon: typeof Mail;
  content: string;
  helperText: string;
}

/**
 * The three outreach artifacts the GTM agent generates -- draftEmail,
 * draftLinkedIn, callOpener -- used to be represented by exactly one of
 * them (draftEmail), shown inside a collapsed <details> with no copy
 * affordance. The other two were generated on every account, at real
 * token cost, and rendered nowhere.
 *
 * Tabbed by channel rather than three stacked blocks: a salesperson
 * deciding how to reach out already knows which channel they're using --
 * showing all three at once is just more scrolling past two things they
 * won't use right now. Each channel gets treatment appropriate to how
 * it's actually used: email/LinkedIn as read-and-copy text (they get
 * pasted verbatim into another tool), the call opener set apart visually
 * (larger, quoted) since it's meant to be glanced at right before
 * speaking, not read as a document.
 */
export function OutreachChannels({
  draftEmail,
  draftLinkedIn,
  callOpener,
}: {
  draftEmail: string | null;
  draftLinkedIn: string | null;
  callOpener: string | null;
}) {
  // Ternaries, not `&&`: draftEmail/draftLinkedIn/callOpener are nullable
  // strings (see schemas.ts's nullableString), not booleans -- if one of
  // them were ever an empty string rather than null (an LLM output
  // oddity, not the documented contract, but not worth trusting blindly
  // either), `draftEmail && {...}` would evaluate to `""` itself rather
  // than being replaced by it, and the filter below would incorrectly
  // keep an empty tab. A ternary checks truthiness and substitutes `null`
  // directly, so both "missing" and "empty" collapse to the same
  // hidden-tab outcome.
  const channels: Channel[] = [
    draftEmail
      ? {
          key: "email",
          label: "Email",
          icon: Mail,
          content: draftEmail,
          helperText: "Review before sending -- paste directly into your email client.",
        }
      : null,
    draftLinkedIn
      ? {
          key: "linkedin",
          label: "LinkedIn",
          icon: MessageCircle,
          content: draftLinkedIn,
          helperText: "Paste into a LinkedIn connection note or direct message.",
        }
      : null,
    callOpener
      ? {
          key: "call",
          label: "Call opener",
          shortLabel: "Call",
          icon: Phone,
          content: callOpener,
          helperText: "A spoken opener for once the call connects -- not a script to read verbatim.",
        }
      : null,
  ].filter((c): c is Channel => c !== null);

  if (channels.length === 0) return null;

  return (
    <Tabs defaultValue={channels[0].key}>
      {/* overflow-x-auto is a safety net for an unusually narrow viewport
          or a longer future label, not the expected case -- the
          shortLabel swap below is what actually keeps all three tabs on
          one line at a 390px viewport without wrapping ("Call opener"
          wrapped to two lines there before this, leaving the tab row
          visibly lopsided) or clipping at the edge with no visual hint
          that there's more to scroll to. */}
      <div className="overflow-x-auto">
        <TabsList>
          {channels.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <c.icon className="size-3.5 shrink-0" />
              <span className="sm:hidden">{c.shortLabel ?? c.label}</span>
              <span className="hidden sm:inline">{c.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {channels.map((c) => (
        <TabsContent key={c.key} value={c.key}>
          <ChannelContent content={c.content} helperText={c.helperText} variant={c.key === "call" ? "spoken" : "written"} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ChannelContent({
  content,
  helperText,
  variant,
}: {
  content: string;
  helperText: string;
  variant: "written" | "spoken";
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission) -- fail quietly rather than showing a broken
      // "Copied" state that didn't actually happen.
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn(
          "rounded-[var(--radius-sm)] border border-line bg-paper p-4 text-ink",
          variant === "spoken"
            ? "font-[var(--font-display)] text-base italic leading-relaxed"
            : "whitespace-pre-wrap text-sm leading-relaxed"
        )}
      >
        {variant === "spoken" ? `“${content}”` : content}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">{helperText}</p>
        <Button variant="outline" size="sm" onClick={onCopy} className="shrink-0">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
