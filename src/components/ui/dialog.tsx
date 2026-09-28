"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  closeLabel,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  closeLabel: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgb(17_18_20/0.45)] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:start-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2",
          "w-full sm:w-[min(92vw,30rem)] max-h-[92dvh] overflow-y-auto",
          wide && "sm:w-[min(94vw,46rem)]",
          "rounded-t-[10px] sm:rounded-ticket bg-card text-ink shadow-lift border border-rule",
          "p-5 sm:p-6 focus:outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <D.Title className="text-lg font-semibold leading-snug text-balance">{title}</D.Title>
            {description ? (
              <D.Description className="text-sm leading-relaxed text-ink-2">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="-me-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-card-recessed hover:text-ink"
            aria-label={closeLabel}
          >
            <X className="size-4" />
          </D.Close>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </D.Content>
    </D.Portal>
  );
}
