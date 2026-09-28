"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { Menu as MenuIcon, X } from "lucide-react";
import { Nav } from "./nav";
import { BrandMark } from "./brand-mark";
import { Button } from "@/components/ui/button";
import type { StaffRole } from "@/lib/permissions";

export function MobileNav({ role, unread }: { role: StaffRole; unread: number }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
          <MenuIcon aria-hidden />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(17_18_20/0.45)] lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-[min(84vw,18rem)] flex-col gap-6 overflow-y-auto bg-counter p-4 shadow-lift lg:hidden">
          <div className="flex items-center justify-between">
            <BrandMark label={t("common.appName")} />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.close")}>
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("nav.main")}</Dialog.Description>
          <Nav role={role} unread={unread} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
