"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Jump to an order by number, or search by phone / name. */
export function OrderSearch({ className }: { className?: string }) {
  const t = useTranslations("orders");
  const router = useRouter();
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        if (q) router.push(`/orders?view=list&q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        name="q"
        type="search"
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="h-10 w-full rounded-control border border-transparent bg-card ps-9 pe-3 text-sm text-ink shadow-ticket placeholder:text-ink-3 focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25"
      />
    </form>
  );
}
