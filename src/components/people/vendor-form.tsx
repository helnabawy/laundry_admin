"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createVendorAction, saveVendorAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export interface VendorValues {
  id: string;
  nameEn: string;
  nameAr: string;
  phone: string | null;
  addressEn: string | null;
  addressAr: string | null;
  city: string | null;
  area: string | null;
  codFee: number;
  invoicePrefix: string;
  isActive: boolean;
}

type Draft = { [K in keyof Omit<VendorValues, "id" | "isActive">]: string } & { isActive: boolean };

function draftOf(vendor: VendorValues | null): Draft {
  return {
    nameEn: vendor?.nameEn ?? "",
    nameAr: vendor?.nameAr ?? "",
    phone: vendor?.phone ?? "",
    addressEn: vendor?.addressEn ?? "",
    addressAr: vendor?.addressAr ?? "",
    city: vendor?.city ?? "",
    area: vendor?.area ?? "",
    codFee: String(vendor?.codFee ?? 5),
    invoicePrefix: vendor?.invoicePrefix ?? "",
    isActive: vendor?.isActive ?? true,
  };
}

/** The fields a laundry has, shared by the edit form and the "add" dialog. */
function VendorFields({ v, setV }: { v: Draft; setV: (v: Draft) => void }) {
  const t = useTranslations("vendors");
  return (
    <>
      <Field label={t("nameEn")}>
        <Input value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} dir="ltr" required maxLength={120} />
      </Field>
      <Field label={t("nameAr")}>
        <Input value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} dir="rtl" lang="ar" required maxLength={120} />
      </Field>
      <Field label={t("addressEn")}>
        <Input value={v.addressEn} onChange={(e) => setV({ ...v, addressEn: e.target.value })} dir="ltr" maxLength={200} />
      </Field>
      <Field label={t("addressAr")}>
        <Input value={v.addressAr} onChange={(e) => setV({ ...v, addressAr: e.target.value })} dir="rtl" lang="ar" maxLength={200} />
      </Field>
      <Field label={t("city")}>
        <Input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} maxLength={80} />
      </Field>
      <Field label={t("area")}>
        <Input value={v.area} onChange={(e) => setV({ ...v, area: e.target.value })} maxLength={80} />
      </Field>
      <Field label={t("phone")}>
        <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} dir="ltr" inputMode="tel" />
      </Field>
      <Field label={t("codFee")}>
        <Input value={v.codFee} onChange={(e) => setV({ ...v, codFee: e.target.value })} dir="ltr" inputMode="decimal" className="numerals" />
      </Field>
      <Field label={t("invoicePrefix")} hint={t("prefixHint")}>
        <Input
          value={v.invoicePrefix}
          onChange={(e) => setV({ ...v, invoicePrefix: e.target.value.toUpperCase() })}
          dir="ltr"
          maxLength={8}
          required
          className="numerals"
        />
      </Field>
      <label className="flex items-center justify-between gap-4 self-end rounded-control bg-card-recessed px-3 py-2.5 text-sm font-medium">
        {t("active")}
        <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
      </label>
    </>
  );
}

export function VendorForm({ vendor }: { vendor: VendorValues }) {
  const tc = useTranslations("common");
  const [v, setV] = useState(() => draftOf(vendor));
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
      <VendorFields v={v} setV={setV} />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="stamp" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {tc("saveChanges")}
        </Button>
      </div>
    </form>
  );
}

export function NewVendorDialog({ vendors }: { vendors: { id: string; nameEn: string; nameAr: string }[] }) {
  const t = useTranslations("vendors");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState(() => draftOf(null));
  const [slug, setSlug] = useState("");
  const [copyFromId, setCopyFromId] = useState(vendors[0]?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="stamp">
          <Plus aria-hidden /> {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("new")} description={t("customersSee")} closeLabel={tc("close")} wide>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createVendorAction({ ...v, codFee: Number(v.codFee), slug, copyFromId: copyFromId || null });
              if (res.ok) {
                toast.success(t("created", { name: locale === "ar" ? v.nameAr : v.nameEn }));
                setOpen(false);
                setV(draftOf(null));
                setSlug("");
              } else toast.error(res.error);
            });
          }}
        >
          <Field label={t("slug")} hint={t("slugHint")} className="sm:col-span-2">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              dir="ltr"
              required
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
          <VendorFields v={v} setV={setV} />
          <Field label={t("copyFrom")} hint={t("copyHint")} className="sm:col-span-2">
            <Select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
              {vendors.map((x) => (
                <option key={x.id} value={x.id}>
                  {locale === "ar" ? x.nameAr : x.nameEn}
                </option>
              ))}
              <option value="">{t("copyNone")}</option>
            </Select>
          </Field>
          <div className="flex justify-end border-t border-rule pt-4 sm:col-span-2">
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {tc("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
