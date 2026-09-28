"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crown, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveTierAction } from "@/server/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export interface TierValues {
  id: string;
  nameEn: string;
  nameAr: string;
  deliveryHours: number;
  isVip: boolean;
  surchargeType: "none" | "flat" | "percentage";
  surchargeValue: number;
  perks: { en: string; ar: string }[];
  isActive: boolean;
}

export function TierDialog({ tier }: { tier: TierValues | null }) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    nameEn: tier?.nameEn ?? "",
    nameAr: tier?.nameAr ?? "",
    deliveryHours: String(tier?.deliveryHours ?? 48),
    isVip: tier?.isVip ?? false,
    surchargeType: tier?.surchargeType ?? "none",
    surchargeValue: String(tier?.surchargeValue ?? 0),
    perksEn: tier?.perks.map((p) => p.en).join("\n") ?? "",
    perksAr: tier?.perks.map((p) => p.ar).join("\n") ?? "",
    isActive: tier?.isActive ?? true,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {tier ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> {tc("edit")}
          </Button>
        ) : (
          <Button variant="stamp">
            <Plus aria-hidden /> {t("addTier")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={tier ? t("editTier") : t("addTier")} closeLabel={tc("close")} wide>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveTierAction(tier?.id ?? null, {
                ...v,
                deliveryHours: Number(v.deliveryHours),
                surchargeValue: Number(v.surchargeValue),
                surchargeType: v.surchargeType as TierValues["surchargeType"],
              });
              if (res.ok) {
                toast.success(t("created", { name: v.nameEn }));
                setOpen(false);
              } else toast.error(res.error);
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("nameEn")}>
              <Input value={v.nameEn} onChange={set("nameEn")} dir="ltr" required maxLength={120} />
            </Field>
            <Field label={t("nameAr")}>
              <Input value={v.nameAr} onChange={set("nameAr")} dir="rtl" lang="ar" required maxLength={120} />
            </Field>
            <Field label={t("deliveryHours")}>
              <Input value={v.deliveryHours} onChange={set("deliveryHours")} inputMode="numeric" className="numerals" dir="ltr" required />
            </Field>
            <label className="flex items-center justify-between gap-3 self-end rounded-control bg-card-recessed px-3 py-2.5 text-sm font-medium">
              {t("isVip")}
              <Switch checked={v.isVip} onCheckedChange={(c) => setV({ ...v, isVip: c })} />
            </label>
            <Field label={t("surchargeType")}>
              <Select value={v.surchargeType} onChange={set("surchargeType")}>
                <option value="none">{t("surchargeNone")}</option>
                <option value="flat">{t("surchargeFlat")}</option>
                <option value="percentage">{t("surchargePercentage")}</option>
              </Select>
            </Field>
            <Field label={t("surchargeValue")}>
              <Input
                value={v.surchargeValue}
                onChange={set("surchargeValue")}
                inputMode="decimal"
                className="numerals"
                dir="ltr"
                disabled={v.surchargeType === "none"}
              />
            </Field>
            <Field label={t("perksEn")} hint={t("perksHint")}>
              <Textarea value={v.perksEn} onChange={set("perksEn")} dir="ltr" rows={3} />
            </Field>
            <Field label={t("perksAr")}>
              <Textarea value={v.perksAr} onChange={set("perksAr")} dir="rtl" lang="ar" rows={3} />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-control bg-card-recessed px-3 py-3 text-sm font-medium">
            {t("visible")}
            <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
          </label>
          <div className="flex justify-end border-t border-rule pt-4">
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {tier ? tc("saveChanges") : tc("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TierSummary({ tier }: { tier: TierValues }) {
  const t = useTranslations("catalogue");
  const locale = useLocale();
  const surcharge =
    tier.surchargeType === "flat"
      ? t("surchargeSummaryFlat", { amount: `AED ${tier.surchargeValue}` })
      : tier.surchargeType === "percentage"
        ? t("surchargeSummaryPercent", { value: tier.surchargeValue })
        : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-lg font-semibold">
        {tier.isVip ? <Crown className="size-4" aria-hidden /> : null}
        {locale === "ar" ? tier.nameAr : tier.nameEn}
        {surcharge ? <span className="numerals rounded-[4px] bg-ink px-1.5 text-[12px] leading-5 text-card">{surcharge}</span> : null}
      </p>
      <p className="text-sm text-ink-2">{t("turnaround", { hours: tier.deliveryHours })}</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 ps-5 text-[13px] text-ink-2">
        {tier.perks.map((p, i) => (
          <li key={i}>{locale === "ar" ? p.ar || p.en : p.en || p.ar}</li>
        ))}
      </ul>
    </div>
  );
}
