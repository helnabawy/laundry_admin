"use client";

import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuRadioGroup = M.RadioGroup;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-ticket border border-rule bg-card p-1 text-sm text-ink shadow-lift",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

const item =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2.5 py-2 outline-none " +
  "data-[highlighted]:bg-card-recessed data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3";

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn(item, className)} {...props} />;
}

export function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(item, "ps-8 relative", className)} {...props}>
      <M.ItemIndicator className="absolute start-2.5 size-1.5 rounded-full bg-ink" />
      {children}
    </M.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 pb-1 pt-2 text-xs font-medium text-ink-3", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-rule" />;
}
