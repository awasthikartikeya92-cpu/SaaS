import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-line/60 text-ink-soft",
        accent: "bg-accent-soft text-accent",
        tier1: "bg-tier-1-soft text-tier-1",
        tier2: "bg-tier-2-soft text-tier-2",
        tier3: "bg-tier-3-soft text-tier-3",
        positive: "bg-tier-3-soft text-positive",
        negative: "bg-tier-1-soft text-negative",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Only for badges that represent a live status (campaign/account state,
   *  verification), never a plain descriptive tag (an industry, a
   *  geography) -- the dot reads as "this can change," which isn't true of
   *  a tag. */
  dot?: boolean;
}

function Badge({ className, variant, dot, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />}
      {props.children}
    </span>
  );
}

export { Badge, badgeVariants };
