"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-rule-strong",
        "bg-counter-deep transition-colors data-[state=checked]:bg-stamp data-[state=checked]:border-stamp",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb
        className={cn(
          "block size-[18px] rounded-full bg-card shadow-sm transition-transform duration-150 ease-out",
          "translate-x-[2px] data-[state=checked]:translate-x-[18px]",
          "rtl:-translate-x-[2px] rtl:data-[state=checked]:-translate-x-[18px]",
        )}
      />
    </S.Root>
  );
}
