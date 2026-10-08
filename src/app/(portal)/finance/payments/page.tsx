import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Download, SearchX } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { paymentLedger, parseFinanceRange, parseLedgerFilters } from "@/server/queries/finance";
import { PAYMENT_PROVIDERS, PAYMENT_STATUSES } from "@/domain/payments";
import { dateTime, money, num, pick } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { RangePicker } from "@/components/finance/range-picker";
import { PaymentStatusBadge } from "@/components/finance/payment-status";
import { cn } from "@/lib/cn";

export default async function PaymentsLedgerPage({ searchParams }: PageProps<"/finance/payments">) {
  const session = await requirePage("finance.view");
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const range = parseFinanceRange(params);
  const f = parseLedgerFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const result = await paymentLedger(session, f, page);
  const qs = (extra: Record<string, string> = {}) =>
    new URLSearchParams(
      Object.entries({ from: f.from, to: f.to, provider: f.provider ?? "", status: f.status ?? "", ...extra }).filter(([, v]) => v),
    ).toString();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <RangePicker path="/finance/payments" range={range} preset={range.preset} extra={{ provider: f.provider, status: f.status }} />
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href={`/api/admin/finance/export?dataset=payments&format=xlsx&${qs()}`}>
              <Download aria-hidden /> XLSX
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={`/api/admin/finance/export?dataset=payments&format=csv&${qs()}`}>
              <Download aria-hidden /> CSV
            </a>
          </Button>
        </div>
      </div>

      <form action="/finance/payments" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="from" value={f.from} />
        <input type="hidden" name="to" value={f.to} />
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-2">
          {t("finance.providerLabel")}
          <Select name="provider" defaultValue={f.provider ?? ""} className="h-9 w-44">
            <option value="">{t("finance.anyProvider")}</option>
            {PAYMENT_PROVIDERS.map((p) => (
              <option key={p} value={p}>{t(`finance.provider.${p}`)}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-2">
          {t("finance.statusLabel")}
          <Select name="status" defaultValue={f.status ?? ""} className="h-9 w-44">
            <option value="">{t("finance.anyStatus")}</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`finance.status.${s}`)}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="sm" className="h-9">{t("common.apply")}</Button>
      </form>

      <Sheet>
        <SheetHeader
          title={t("finance.ledger")}
          actions={<span className="text-sm text-ink-2">{t("common.resultsCount", { count: num(locale, result.total) })}</span>}
        />
        {result.rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("finance.noPayments")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <caption className="sr-only">{t("finance.ledger")}</caption>
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("finance.when")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("orders.number")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("finance.providerLabel")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("finance.statusLabel")}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("finance.amount")}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("finance.fees")}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("finance.refunds")}</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium sm:px-5">{t("finance.net")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-card-recessed">
                    <td className="numerals px-4 py-2.5 text-[12.5px] text-ink-2 sm:px-5">
                      {dateTime(locale, r.paidAt ?? r.createdAt)}
                      {r.reference ? <span className="block max-w-44 truncate text-[11.5px] text-ink-3" dir="ltr">{r.reference}</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/orders/${r.orderId}`} className="numerals font-semibold hover:underline">{r.orderNumber}</Link>
                      <span className="block max-w-40 truncate text-[12px] text-ink-3">
                        {r.customerName || "—"} · {pick(locale, r.vendor.nameEn, r.vendor.nameAr)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">
                      {t(`finance.provider.${r.provider}`)}
                      <span className="block text-[12px] text-ink-3">{t(`finance.method.${r.method}`)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <PaymentStatusBadge status={r.status} />
                      {r.failureReason && (r.status === "failed" || r.status === "cancelled") ? (
                        <span className="block max-w-44 truncate text-[12px] text-ink-3">{r.failureReason}</span>
                      ) : null}
                    </td>
                    <td className="numerals px-3 py-2.5 text-end">{money(locale, r.amount)}</td>
                    <td className="numerals px-3 py-2.5 text-end text-ink-2">{r.fee ? money(locale, r.fee) : "—"}</td>
                    <td className="numerals px-3 py-2.5 text-end text-ink-2">{r.refunded ? money(locale, r.refunded) : "—"}</td>
                    <td className={cn("numerals px-4 py-2.5 text-end font-medium sm:px-5", r.net === 0 && "text-ink-3")}>{money(locale, r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
      <nav className="mt-4 flex items-center justify-end gap-2" aria-label={t("common.pagination")}>
        <Button asChild variant="outline" size="sm">
          <Link href={`/finance/payments?${qs({ page: String(Math.max(1, page - 1)) })}`} className={cn(page <= 1 && "pointer-events-none opacity-45")}>
            <ChevronLeft className="flip-rtl" aria-hidden /> {t("common.previous")}
          </Link>
        </Button>
        <span className="numerals text-[13px] text-ink-2">{page} / {result.pages}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/finance/payments?${qs({ page: String(Math.min(result.pages, page + 1)) })}`} className={cn(page >= result.pages && "pointer-events-none opacity-45")}>
            {t("common.next")} <ChevronRight className="flip-rtl" aria-hidden />
          </Link>
        </Button>
      </nav>
    </>
  );
}
