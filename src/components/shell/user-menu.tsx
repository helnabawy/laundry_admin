"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogOut, UserRound } from "lucide-react";
import { logout } from "@/server/actions/auth";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { StaffRole } from "@/lib/permissions";

export function UserMenu({ name, email, role }: { name: string; email: string; role: StaffRole }) {
  const t = useTranslations();
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Menu>
      <MenuTrigger
        className="grid size-9 place-items-center rounded-full bg-ink text-[12px] font-semibold text-card outline-offset-2"
        aria-label={t("nav.account")}
      >
        {initials}
      </MenuTrigger>
      <MenuContent className="min-w-60">
        <MenuLabel className="text-ink">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-xs font-normal text-ink-3" dir="ltr">
            {email}
          </span>
          <span className="mt-1 block text-xs font-normal text-ink-2">{t(`roles.${role}`)}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden /> {t("nav.profile")}
          </Link>
        </MenuItem>
        <MenuItem onSelect={() => void logout()}>
          <LogOut className="flip-rtl" aria-hidden /> {t("nav.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
