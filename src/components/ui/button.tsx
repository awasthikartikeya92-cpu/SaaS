import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-medium transition-[background-color,box-shadow,border-color,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 not-disabled:cursor-pointer not-disabled:active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper shadow-sm hover:bg-ink/90 not-disabled:active:shadow-xs",
        accent: "bg-accent text-white shadow-sm hover:bg-accent/90 not-disabled:active:shadow-xs",
        outline: "border border-line-strong bg-paper-raised text-ink shadow-xs hover:border-ink-soft/40 hover:bg-paper",
        ghost: "text-ink-soft hover:bg-paper hover:text-ink",
        destructive: "bg-negative text-white shadow-sm hover:bg-negative/90 not-disabled:active:shadow-xs",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
