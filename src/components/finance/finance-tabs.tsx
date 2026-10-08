"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/finance", label: "tabOverview", match: (p: string) => p === "/finance" },
  { href: "/finance/payments", label: "tabPayments", match: (p: string) => p.startsWith("/finance/payments") },
  { href: "/finance/expenses", label: "tabExpenses", match: (p: string) => p.startsWith("/finance/expenses") },
  { href: "/finance/settings", label: "tabSettings", match: (p: string) => p.startsWith("/finance/settings"), manage: true },
];

export function FinanceTabs({ canManage }: { canManage: boolean }) {
  const t = useTranslations("finance");
  const pathname = usePathname();
  return (
    <nav className="-mx-3 mb-5 flex gap-1 overflow-x-auto border-b border-rule px-3 sm:mx-0 sm:px-0" aria-label={t("title")}>
      {TABS.filter((tab) => canManage || !tab.manage).map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors",
              active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
