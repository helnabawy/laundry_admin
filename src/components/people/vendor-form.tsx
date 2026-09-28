"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveVendorAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function VendorForm({
  vendor,
}: {
  vendor: { id: string; nameEn: string; nameAr: string; phone: string | null; codFee: number; invoicePrefix: string; isActive: boolean };
}) {
  const t = useTranslations("vendors");
  const tc = useTranslations("common");
  const [v, setV] = useState({ ...vendor, phone: vendor.phone ?? "", codFee: String(vendor.codFee) });
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveVendorAction(vendor.id, { ...v, codFee: Number(v.codFee) });
          if (res.ok) toast.success(tc("saved"));
          else toast.error(res.error);
        });
      }}
    >
      <Field label={t("nameEn")}>
        <Input value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} dir="ltr" required />
      </Field>
      <Field label={t("nameAr")}>
        <Input value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} dir="rtl" lang="ar" required />
      </Field>
      <Field label={t("phone")}>
        <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} dir="ltr" inputMode="tel" />
      </Field>
      <Field label={t("codFee")}>
        <Input value={v.codFee} onChange={(e) => setV({ ...v, codFee: e.target.value })} dir="ltr" inputMode="decimal" className="numerals" />
      </Field>
      <Field label={t("invoicePrefix")}>
        <Input value={v.invoicePrefix} onChange={(e) => setV({ ...v, invoicePrefix: e.target.value.toUpperCase() })} dir="ltr" maxLength={8} className="numerals" />
      </Field>
      <label className="flex items-center justify-between gap-4 self-end rounded-control bg-card-recessed px-3 py-2.5 text-sm font-medium">
        {t("active")}
        <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
      </label>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="stamp" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {tc("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
