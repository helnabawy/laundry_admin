import { getLocale, getTranslations } from "next-intl/server";
import type { OrderPaymentView } from "@/server/queries/finance";
import { dateTime, money } from "@/lib/format";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { PaymentStatusBadge } from "./payment-status";
import { RefundDialog } from "./refund-dialog";

/** Every payment attempt on an order, with its refunds and the refund action. */
export async function OrderPayments({ payments, canRefund }: { payments: OrderPaymentView[]; canRefund: boolean }) {
  const t = await getTranslations("finance");
  const locale = await getLocale();
  return (
    <Sheet>
      <SheetHeader title={t("orderPayments")} />
      {payments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-2 sm:px-5">{t("noOrderPayments")}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {payments.map((p) => (
            <li key={p.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {t(`provider.${p.provider}`)}
                    <span className="font-normal text-ink-3">· {t(`method.${p.method}`)}</span>
                    <PaymentStatusBadge status={p.status} />
                  </p>
                  <p className="numerals text-[12.5px] text-ink-2">
                    {dateTime(locale, p.paidAt ?? p.createdAt)}
                    {p.reference ? <span dir="ltr"> · {p.reference}</span> : null}
                  </p>
                  {p.failureReason && (p.status === "failed" || p.status === "cancelled" || p.status === "expired") ? (
                    <p className="text-[12.5px] text-ink-3">{p.failureReason}</p>
                  ) : null}
                </div>
                <div className="text-end">
                  <p className="numerals font-semibold">{money(locale, p.amount)}</p>
                  {p.fee > 0 ? <p className="numerals text-[12px] text-ink-3">{t("feeLine", { fee: money(locale, p.fee) })}</p> : null}
                </div>
              </div>
              {p.refunds.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 border-s-2 border-rule ps-3 text-[13px]">
                  {p.refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2 text-ink-2">
                      <span>
                        {t("refundLine", { date: dateTime(locale, r.createdAt, "short"), by: r.by ?? "—" })}
                        <span className="block text-ink-3">{r.reason}</span>
                      </span>
                      <span className="numerals text-danger">−{money(locale, r.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canRefund && p.refundable > 0 ? (
                <div className="mt-2 flex justify-end">
                  <RefundDialog paymentId={p.id} refundable={p.refundable} provider={t(`provider.${p.provider}`)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
