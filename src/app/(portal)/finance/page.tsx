import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { financeData, parseFinanceRange } from "@/server/queries/finance";
import { money, num } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { RangePicker } from "@/components/finance/range-picker";
import { ProfitPerDay } from "@/components/finance/profit-chart";
import { cn } from "@/lib/cn";

export default async function FinanceOverviewPage({ searchParams }: PageProps<"/finance">) {
  const session = await requirePage("finance.view");
  const t = await getTranslations("finance");
  const locale = await getLocale();
  const range = parseFinanceRange(await searchParams);
  const d = await financeData(session, range);
  const p = d.pnl;
  const exportQs = new URLSearchParams({ from: range.from, to: range.to });
  const maxProvider = Math.max(1, ...d.byProvider.map((r) => r.gross));
  const maxCategory = Math.max(1, ...d.byCategory.map((r) => r.amount));

  // The P&L reads top to bottom like a statement: in, out, what's left.
  const statement: { label: string; value: number; sign?: "-" | "="; hint?: string; strong?: boolean }[] = [
    { label: t("gross"), value: p.gross, hint: t("grossHint", { count: d.payments }) },
    { label: t("refunds"), value: p.refunds, sign: "-" },
    { label: t("netRevenue"), value: p.netRevenue, sign: "=", strong: true },
    { label: t("fees"), value: p.fees, sign: "-", hint: t("feesHint") },
    { label: t("expenses"), value: p.expenses, sign: "-" },
    { label: t("profit"), value: p.profit, sign: "=", strong: true },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <RangePicker path="/finance" range={range} preset={range.preset} />
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href={`/api/admin/finance/export?dataset=pnl&format=xlsx&${exportQs}`}>
              <Download aria-hidden /> {t("exportPnl")}
            </a>
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section className="ticket-notched self-start rounded-ticket bg-card shadow-ticket" aria-labelledby="pnl-title">
          <div className="ticket-stub flex h-[34px] items-center justify-between gap-3 rounded-t-ticket bg-grey px-4 text-[13px] font-medium text-[#1d1d1f] sm:px-5">
            <span id="pnl-title">{t("statement")}</span>
            <span className="numerals">{range.from} – {range.to}</span>
          </div>
          <div className="perforation" aria-hidden />
          <dl className="px-4 py-2 sm:px-5">
            {statement.map((row) => (
              <div key={row.label} className={cn("py-2.5", row.sign === "=" ? "border-t-2 border-ink/80" : "border-b border-dashed border-rule last:border-b-0")}>
                <div className="flex items-baseline gap-1.5">
                  <span className="w-3 shrink-0 text-ink-3" aria-hidden>{row.sign === "-" ? "−" : row.sign === "=" ? "=" : ""}</span>
                  <dt className={cn("shrink-0 text-sm", row.strong ? "font-semibold text-ink" : "text-ink-2")}>{row.label}</dt>
                  <span className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-rule-strong" aria-hidden />
                  <dd
                    className={cn(
                      "numerals shrink-0 tracking-[-0.03em] [font-stretch:88%]",
                      row.strong ? "text-[20px] font-semibold" : "text-[16px] font-medium",
                      row.label === t("profit") && row.value < 0 && "text-danger",
                    )}
                  >
                    {row.sign === "-" && row.value > 0 ? "−" : ""}
                    {money(locale, row.value)}
                  </dd>
                </div>
                {row.hint ? <p className="ps-[1.125rem] text-[11.5px] text-ink-3">{row.hint}</p> : null}
              </div>
            ))}
            <div className="flex items-baseline justify-between py-2.5 text-sm text-ink-2">
              <span>{t("margin")}</span>
              <span className="numerals">{p.margin === null ? "—" : `${num(locale, p.margin * 100, 1)}%`}</span>
            </div>
          </dl>
        </section>

        <div className="grid content-start gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Sheet className="px-4 py-4 sm:px-5">
              <p className="text-sm text-ink-2">{t("outstanding")}</p>
              <p className="numerals mt-1 text-[24px] font-semibold tracking-[-0.03em]">{money(locale, d.outstanding.amount)}</p>
              <p className="text-[12px] text-ink-3">{t("outstandingHint", { count: d.outstanding.count })}</p>
            </Sheet>
            <Sheet className="px-4 py-4 sm:px-5">
              <p className="text-sm text-ink-2">{t("pendingOnline")}</p>
              <p className="numerals mt-1 text-[24px] font-semibold tracking-[-0.03em]">{money(locale, d.pendingOnline.amount)}</p>
              <p className="text-[12px] text-ink-3">
                <Link href="/finance/payments?status=pending" className="underline decoration-rule-strong hover:decoration-ink">
                  {t("pendingOnlineHint", { count: d.pendingOnline.count })}
                </Link>
              </p>
            </Sheet>
          </div>
          <Sheet>
            <SheetHeader title={t("profitPerDay")} />
            <div className="px-4 py-4 sm:px-5">
              <ProfitPerDay data={d.perDay} />
            </div>
          </Sheet>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Sheet>
          <SheetHeader title={t("byProvider")} />
          {d.byProvider.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-2">{t("noPayments")}</p>
          ) : (
            <ul className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              {d.byProvider.map((r) => (
                <li key={`${r.provider}-${r.method}`} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-ink-2">{t(`provider.${r.provider}`)}</span>
                  <span className="h-3 rounded-e-[3px] bg-card-recessed">
                    <span className="block h-full rounded-e-[3px] bg-[var(--chart-quick)]" style={{ width: `${(r.gross / maxProvider) * 100}%` }} />
                  </span>
                  <span className="numerals text-end text-[13px]">
                    {money(locale, r.gross)}
                    <span className="block text-[11.5px] text-ink-3">{t("providerLine", { count: r.count, fees: money(locale, r.fees) })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
        <Sheet>
          <SheetHeader
            title={t("byCategory")}
            actions={
              <Link href="/finance/expenses" className="text-sm text-ink-2 underline decoration-rule-strong hover:text-ink">
                {t("manageExpenses")}
              </Link>
            }
          />
          {d.byCategory.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-2">{t("noExpenses")}</p>
          ) : (
            <ul className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              {d.byCategory.map((r) => (
                <li key={r.category} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-ink-2">{t(`category.${r.category}`)}</span>
                  <span className="h-3 rounded-e-[3px] bg-card-recessed">
                    <span className="block h-full rounded-e-[3px] bg-[var(--chart-neutral)]" style={{ width: `${(r.amount / maxCategory) * 100}%` }} />
                  </span>
                  <span className="numerals text-end text-[13px]">{money(locale, r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>
    </>
  );
}
