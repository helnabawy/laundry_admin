"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveGatewaySettingsAction } from "@/server/actions/finance";
import type { GatewaySettingsView } from "@/server/queries/finance";
import { CARD_PROVIDERS, type PaymentProvider } from "@/domain/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

type Row = GatewaySettingsView["gateways"][number];
type Draft = Omit<Row, "feePercent" | "feeFixed" | "minAmount" | "maxAmount"> & {
  feePercent: string;
  feeFixed: string;
  minAmount: string;
  maxAmount: string;
};

const toDraft = (g: Row): Draft => ({
  ...g,
  feePercent: String(g.feePercent),
  feeFixed: String(g.feeFixed),
  minAmount: g.minAmount == null ? "" : String(g.minAmount),
  maxAmount: g.maxAmount == null ? "" : String(g.maxAmount),
});

/** Which providers this laundry uses and what each one keeps per payment. */
export function GatewaySettingsForm({ settings }: { settings: GatewaySettingsView }) {
  const t = useTranslations("finance");
  const [cardProvider, setCardProvider] = useState(settings.cardProvider);
  const [rows, setRows] = useState(settings.gateways.map(toDraft));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const update = (provider: PaymentProvider, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.provider === provider ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const res = await saveGatewaySettingsAction({
        cardProvider: cardProvider as (typeof CARD_PROVIDERS)[number],
        gateways: rows.map((r) => ({
          provider: r.provider,
          isEnabled: r.isEnabled,
          feePercent: r.feePercent,
          feeFixed: r.feeFixed,
          minAmount: r.minAmount,
          maxAmount: r.maxAmount,
        })),
      });
      if (res.ok) {
        setErrors({});
        toast.success(t("settingsSaved"));
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });

  return (
    <div className="grid gap-5">
      <fieldset className="rounded-ticket bg-card px-4 py-4 shadow-ticket sm:px-5">
        <legend className="sr-only">{t("cardProvider")}</legend>
        <p className="text-[15px] font-semibold">{t("cardProvider")}</p>
        <p className="mb-3 text-sm text-ink-2">{t("cardProviderHelp")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("cardProvider")}>
          {CARD_PROVIDERS.map((p) => (
            <label
              key={p}
              className={cn(
                "flex h-10 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm",
                cardProvider === p ? "border-ink bg-card-recessed font-medium" : "border-rule-strong",
              )}
            >
              <input type="radio" name="cardProvider" value={p} checked={cardProvider === p} onChange={() => setCardProvider(p)} className="accent-[var(--stamp)]" />
              {t(`provider.${p}`)}
            </label>
          ))}
        </div>
        {errors.cardProvider ? <p className="mt-2 text-[13px] text-danger" role="alert">{t("cardProviderOff")}</p> : null}
      </fieldset>

      <div className="overflow-x-auto rounded-ticket bg-card shadow-ticket">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">{t("providersTitle")}</caption>
          <thead>
            <tr className="border-b border-rule text-[12.5px] text-ink-3">
              <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("providerLabel")}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("enabled")}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("feePercent")}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("feeFixed")}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("minAmount")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("maxAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = t(`provider.${r.provider}`);
              const err = (k: string) => errors[`gateways.${i}.${k}`];
              const cell = (k: "feePercent" | "feeFixed" | "minAmount" | "maxAmount", disabled = false) => (
                <Input
                  aria-label={`${name}: ${t(k)}`}
                  aria-invalid={!!err(k) || undefined}
                  inputMode="decimal"
                  dir="ltr"
                  className="h-9 w-28"
                  value={r[k]}
                  disabled={disabled}
                  placeholder={k === "minAmount" || k === "maxAmount" ? t("noLimit") : undefined}
                  onChange={(e) => update(r.provider, { [k]: e.target.value })}
                />
              );
              const cash = r.provider === "cash";
              return (
                <tr key={r.provider} className="border-b border-rule last:border-0">
                  <th scope="row" className="px-4 py-3 text-start font-medium sm:px-5">
                    {name}
                    <span className="block text-[12px] font-normal text-ink-3">{t(`providerNote.${r.provider}`)}</span>
                  </th>
                  <td className="px-3 py-3">
                    <Switch aria-label={`${name}: ${t("enabled")}`} checked={r.isEnabled} onCheckedChange={(v) => update(r.provider, { isEnabled: v })} />
                  </td>
                  <td className="px-3 py-3">{cell("feePercent", cash)}</td>
                  <td className="px-3 py-3">{cell("feeFixed", cash)}</td>
                  <td className="px-3 py-3">{cell("minAmount")}</td>
                  <td className="px-4 py-3 sm:px-5">
                    {cell("maxAmount")}
                    {err("maxAmount") ? <p className="mt-1 text-[12px] text-danger">{t("minAboveMax")}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-ink-3">{t("feesNote")}</p>
      <div className="flex justify-end">
        <Button variant="stamp" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("saveSettings")}
        </Button>
      </div>
    </div>
  );
}
