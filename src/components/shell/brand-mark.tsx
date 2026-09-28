import { cn } from "@/lib/cn";

/**
 * The wordmark: a claim ticket's stub with the product's name punched in.
 * Drawn, not a font glyph; stroke-matched to the icon set.
 */
export function BrandMark({ className, label }: { className?: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <path
          d="M6 4h20a2 2 0 0 1 2 2v7a3 3 0 0 0 0 6v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a3 3 0 0 0 0-6V6a2 2 0 0 1 2-2Z"
          className="fill-canary"
        />
        <path d="M4 10.5h24" className="stroke-ink/25" strokeWidth="1" strokeDasharray="1.5 2" />
        <path d="M11 16.5h10M11 21h6" className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold leading-none tracking-[-0.01em]">{label}</span>
    </span>
  );
}
