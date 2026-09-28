import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Buttons. `stamp` is the one action colour (solid ink) and marks the
 * primary, legal next step. Everything else is quieter.
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-45 select-none",
    "[&_svg]:size-4 [&_svg]:shrink-0 rtl:[&_svg.flip-rtl]:-scale-x-100",
    "active:[animation:stamp-press_140ms_ease-out]",
  ],
  {
    variants: {
      variant: {
        stamp: "bg-stamp text-on-stamp hover:bg-stamp-hover shadow-[0_1px_0_rgb(0_0_0/0.2)]",
        outline: "border border-rule-strong bg-card text-ink hover:bg-card-recessed",
        ghost: "text-ink-2 hover:bg-counter-deep/60 hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger-hover dark:text-[#1b0a07]",
        dangerOutline: "border border-danger/50 text-danger bg-card hover:bg-danger-wash",
        link: "text-ink underline decoration-rule-strong hover:decoration-ink px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-10",
        iconSm: "size-8",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
