"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setVendorFilter } from "@/server/actions/auth";
import { Select } from "@/components/ui/field";

/** Super admin only, and only once there is more than one laundry. */
export function VendorSwitcher({
  vendors,
  value,
}: {
  vendors: { id: string; nameEn: string; nameAr: string }[];
  value: string;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={t("laundry")}
      className="h-9 w-44"
      value={value}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setVendorFilter(e.target.value);
          router.refresh();
        })
      }
    >
      <option value="all">{t("allLaundries")}</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {locale === "ar" ? v.nameAr : v.nameEn}
        </option>
      ))}
    </Select>
  );
}
