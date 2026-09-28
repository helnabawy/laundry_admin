"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Building2,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  ScrollText,
  Shirt,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { NAV_SECTIONS, type NavIcon } from "@/lib/nav";
import { can, type StaffRole } from "@/lib/permissions";
import { cn } from "@/lib/cn";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  catalogue: Shirt,
  drivers: Truck,
  staff: UsersRound,
  reports: FileBarChart2,
  vendors: Building2,
  audit: ScrollText,
  notifications: Bell,
};

export function Nav({
  role,
  unread,
  onNavigate,
}: {
  role: StaffRole;
  unread: number;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("main")} className="flex flex-col gap-5">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => can(role, i.capability));
        if (items.length === 0) return null;
        return (
          <div key={section.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-medium text-ink-3">{t(section.label)}</p>
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-card text-ink shadow-ticket"
                      : "text-ink-2 hover:bg-counter-deep/70 hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")}
                    aria-hidden
                  />
                  <span className="truncate">{t(item.label)}</span>
                  {item.icon === "notifications" && unread > 0 ? (
                    <span className="numerals ms-auto rounded-[4px] bg-canary px-1.5 text-[11px] leading-5 text-[#3d3000]">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
