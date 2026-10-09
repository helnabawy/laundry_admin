"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setVendorFilter } from "@/server/actions/auth";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/**
 * Narrows the portal to one laundry. Shown to a super admin once there is
 * more than one laundry, and to a laundry admin assigned to several.
 */
export function VendorSwitcher({
  vendors,
  value,
  allLabel = "allLaundries",
  className,
}: {
  vendors: { id: string; nameEn: string; nameAr: string }[];
  value: string;
  allLabel?: "allLaundries" | "allMyLaundries";
  className?: string;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={t("laundry")}
      className={cn("h-9 w-44", className)}
      value={value}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setVendorFilter(e.target.value);
          router.refresh();
        })
      }
    >
      <option value="all">{t(allLabel)}</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {locale === "ar" ? v.nameAr : v.nameEn}
        </option>
      ))}
    </Select>
  );
}
