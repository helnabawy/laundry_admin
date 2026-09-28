"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { setLocale } from "@/server/actions/auth";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";

export function LanguageToggle({ compact }: { compact?: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      disabled={pending}
      aria-label={t("switchLanguage")}
      onClick={() =>
        start(async () => {
          await setLocale(next);
          router.refresh();
        })
      }
    >
      <Languages aria-hidden />
      {compact ? null : <span lang={next}>{next === "ar" ? "العربية" : "English"}</span>}
    </Button>
  );
}

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("theme")}>
          <Sun className="dark:hidden" aria-hidden />
          <Moon className="hidden dark:block" aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("theme")}</MenuLabel>
        <MenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <MenuRadioItem value="light">
            <Sun aria-hidden /> {t("themeLight")}
          </MenuRadioItem>
          <MenuRadioItem value="dark">
            <Moon aria-hidden /> {t("themeDark")}
          </MenuRadioItem>
          <MenuRadioItem value="system">
            <Monitor aria-hidden /> {t("themeSystem")}
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
