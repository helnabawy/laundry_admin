import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Crown } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { dashboardData, type LaundryRow, type RangeDays } from "@/server/queries/dashboard";
import { BOARD_COLUMNS } from "@/domain/order-workflow";
import { STATUS_STOCK, STOCK_CLASSES, STATUS_ICON } from "@/lib/stages";
import { minuteToHhmm } from "@/domain/slots";
import { money, num, pick } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { OrdersPerDay, RevenuePerDay } from "@/components/charts/day-charts";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { financeData, parseFinanceRange } from "@/server/queries/finance";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

const RANGES: RangeDays[] = [7, 30, 90];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requirePage("dashboard.view");
  const t = await getTranslations();
  const locale = await getLocale();
  const rangeParam = Number((await searchParams).range);
  const range: RangeDays = RANGES.includes(rangeParam as RangeDays) ? (rangeParam as RangeDays) : 30;
  const d = await dashboardData(session, range);
  const finance = can(session.role, "finance.view")
    ? await financeData(session, parseFinanceRange({ range: String(range) }))
    : null;
  const openTotal = d.tally.reduce((s, x) => s + x.count, 0);
  const maxStatus = Math.max(1, ...d.byStatus.map((s) => s.count));
  const maxProduct = Math.max(1, ...d.topProducts.map((p) => p.quantity));
  const maxSlot = Math.max(1, ...d.slots.map((s) => s.count));
  const tierTotal = d.tiers.reduce((s, x) => s + x.count, 0);

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <div className="flex rounded-control bg-counter-deep p-1" role="group" aria-label={t("dashboard.range")}>
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/dashboard?range=${r}`}
                aria-current={r === range ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-[6px] px-3 text-sm font-medium",
                  r === range ? "bg-card text-ink shadow-ticket" : "text-ink-2 hover:text-ink",
                )}
              >
                {t(`dashboard.range${r}`)}
              </Link>
            ))}
          </div>
        }
      />

      {/* The rack right now: one tally strip, stage by stage */}
      <Sheet className="mb-5">
        <SheetHeader
          title={t("dashboard.tallyTitle")}
          actions={<span className="numerals text-sm text-ink-2">{openTotal}</span>}
        />
        <ol className="grid grid-cols-2 divide-rule sm:grid-cols-4 xl:grid-cols-8 [&>li]:border-rule">
          {d.tally.map(({ column, count }, i) => {
            const col = BOARD_COLUMNS.find((c) => c.id === column)!;
            const stock = STOCK_CLASSES[STATUS_STOCK[col.statuses[0]]];
            const Icon = STATUS_ICON[col.statuses[0]];
            return (
              <li
                key={column}
                className={cn(
                  "relative border-b px-4 py-4 sm:px-5 xl:border-b-0",
                  i % 2 === 0 && "border-e",
                  "sm:border-e xl:[&:last-child]:border-e-0",
                )}
              >
                <span className={cn("absolute inset-x-0 top-0 h-1", stock.band)} aria-hidden />
                <Link href="/orders" className="group block">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                    <Icon className="size-3.5" aria-hidden />
                    {t(`stage.${column}`)}
                  </span>
                  <span className="numerals mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] [font-stretch:82%] group-hover:underline">
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Sheet>

      {/* The period's receipt: ruled rows with leaders, not KPI cards */}
      <section className="ticket-notched mb-5 rounded-ticket bg-card shadow-ticket" aria-labelledby="period-title">
        <div className="ticket-stub flex h-[34px] items-center justify-between gap-3 rounded-t-ticket bg-grey px-4 text-[13px] font-medium text-[#1d1d1f] sm:px-5">
          <span id="period-title">{t("dashboard.periodReceipt")}</span>
          <span>{t(`dashboard.range${range}`)}</span>
        </div>
        <div className="perforation" aria-hidden />
        <dl className="grid gap-x-10 px-4 py-3 sm:px-5 md:grid-cols-2 xl:grid-cols-3">
          {[
            { label: t("dashboard.orders"), value: num(locale, d.orders), hint: t("dashboard.ordersHint") },
            { label: t("dashboard.revenue"), value: money(locale, d.revenue), hint: t("dashboard.revenueHint") },
            { label: t("dashboard.avgOrder"), value: d.paidInvoices ? money(locale, d.revenue / d.paidInvoices) : "—", hint: null },
            {
              label: t("dashboard.turnaround"),
              value: d.turnaroundHours !== null ? t("dashboard.hours", { value: num(locale, d.turnaroundHours, 1) }) : "—",
              hint: t("dashboard.turnaroundHint"),
            },
            { label: t("dashboard.failed"), value: num(locale, d.failedStops), hint: null },
            {
              label: t("dashboard.rating"),
              value: d.rating.avg !== null ? `${num(locale, d.rating.avg, 1)} / 5` : "—",
              hint: t("dashboard.ratingCount", { count: d.rating.count }),
            },
            ...(finance
              ? [
                  { label: t("dashboard.fees"), value: money(locale, finance.pnl.fees), hint: null },
                  { label: t("dashboard.profit"), value: money(locale, finance.pnl.profit), hint: t("dashboard.profitHint") },
                ]
              : []),
          ].map((m) => (
            <div
              key={m.label}
              className="border-b border-dashed border-rule py-2.5 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <div className="flex items-baseline gap-1.5">
                <dt className="shrink-0 text-sm text-ink-2">{m.label}</dt>
                <span className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-rule-strong" aria-hidden />
                <dd className="numerals shrink-0 text-[17px] font-semibold tracking-[-0.03em] [font-stretch:88%]">{m.value}</dd>
              </div>
              {m.hint ? <p className="text-[11.5px] text-ink-3">{m.hint}</p> : null}
            </div>
          ))}
        </dl>
      </section>

      {d.laundries ? <LaundryComparison rows={d.laundries} locale={locale} t={t} /> : null}

      {d.orders === 0 ? (
        <Sheet className="px-5 py-10 text-center text-sm text-ink-2">{t("dashboard.noData")}</Sheet>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Sheet>
            <SheetHeader title={t("dashboard.ordersPerDay")} />
            <div className="px-4 py-4 sm:px-5">
              <OrdersPerDay data={d.perDay} />
            </div>
          </Sheet>
          <Sheet>
            <SheetHeader title={t("dashboard.revenuePerDay")} />
            <div className="px-4 py-4 sm:px-5">
              <RevenuePerDay data={d.perDay} />
            </div>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("dashboard.byStatus")} />
            <ul className="flex flex-col gap-2.5 px-4 py-4 sm:px-5">
              {d.byStatus.map((s) => {
                const stock = STOCK_CLASSES[STATUS_STOCK[s.status]];
                const Icon = STATUS_ICON[s.status];
                return (
                  <li key={s.status} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="flex items-center gap-1.5 truncate text-ink-2">
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      {t(`status.${s.status}`)}
                    </span>
                    <span className="h-3 rounded-e-[3px] bg-card-recessed">
                      <span className={cn("block h-full rounded-e-[3px]", stock.band)} style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                    </span>
                    <span className="numerals text-end text-[13px]">{s.count}</span>
                  </li>
                );
              })}
            </ul>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("dashboard.topProducts")} />
            <ul className="flex flex-col gap-2.5 px-4 py-4 sm:px-5">
              {d.topProducts.map((p) => (
                <li key={p.nameEn} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-sm">
                  <span className="truncate text-ink-2">{pick(locale, p.nameEn, p.nameAr)}</span>
                  <span className="h-3 rounded-e-[3px] bg-card-recessed">
                    <span className="block h-full rounded-e-[3px] bg-[var(--chart-neutral)]" style={{ width: `${(p.quantity / maxProduct) * 100}%` }} />
                  </span>
                  <span className="numerals text-end text-[13px]">{p.quantity}</span>
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("dashboard.tierMix")} />
            <div className="px-4 py-4 sm:px-5">
              <div className="flex h-8 gap-0.5 overflow-hidden rounded-[4px]" aria-hidden>
                {d.tiers.map((tier) => (
                  <span
                    key={tier.nameEn}
                    className={tier.isVip ? "bg-[var(--chart-neutral)]" : "bg-[var(--chart-neutral-soft)]"}
                    style={{ width: `${(tier.count / Math.max(1, tierTotal)) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {d.tiers.map((tier) => (
                  <li key={tier.nameEn} className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-[2px]", tier.isVip ? "bg-[var(--chart-neutral)]" : "bg-[var(--chart-neutral-soft)]")} aria-hidden />
                    {tier.isVip ? <Crown className="size-3.5" aria-hidden /> : null}
                    {pick(locale, tier.nameEn, tier.nameAr)}
                    <span className="numerals text-[13px] text-ink-2">
                      {tier.count} · {num(locale, (tier.count / Math.max(1, tierTotal)) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("dashboard.slotLoad")} />
            <ul className="flex h-40 items-end gap-3 px-4 pb-3 pt-4 sm:px-5">
              {d.slots.map((s) => (
                <li key={s.windowId} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="numerals text-[12px] text-ink-2">{s.count}</span>
                  <span className="w-full max-w-14 rounded-t-[3px] bg-[var(--chart-neutral)]" style={{ height: `${(s.count / maxSlot) * 100}%` }} />
                  <span className="numerals text-[11.5px] text-ink-3">{s.startMinute !== null ? minuteToHhmm(s.startMinute) : "—"}</span>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      )}
    </>
  );
}

/** Looking at several laundries ("All laundries" / "All my laundries"): the period's numbers side by side. */
function LaundryComparison({
  rows,
  locale,
  t,
}: {
  rows: LaundryRow[];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const th = "px-3 py-2.5 text-start text-[12.5px] font-medium text-ink-2 first:ps-4 sm:first:ps-5";
  const td = "numerals px-3 py-3 text-end text-[13.5px] first:ps-4 sm:first:ps-5 last:pe-4 sm:last:pe-5";
  return (
    <Sheet className="mb-5">
      <SheetHeader title={t("dashboard.laundriesTitle")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse">
          <caption className="sr-only">{t("dashboard.laundriesTitle")}</caption>
          <thead className="border-b border-rule">
            <tr>
              <th scope="col" className={th}>{t("nav.laundry")}</th>
              <th scope="col" className={cn(th, "text-end")}>{t("dashboard.orders")}</th>
              <th scope="col" className={cn(th, "text-end")}>{t("dashboard.openNow")}</th>
              <th scope="col" className={cn(th, "w-[22%]")}>{t("dashboard.revenue")}</th>
              <th scope="col" className={cn(th, "text-end")}>{t("dashboard.avgOrder")}</th>
              <th scope="col" className={cn(th, "text-end")}>{t("dashboard.turnaround")}</th>
              <th scope="col" className={cn(th, "text-end")}>{t("dashboard.failed")}</th>
              <th scope="col" className={cn(th, "text-end last:pe-4 sm:last:pe-5")}>{t("dashboard.rating")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((r) => {
              const share = totalRevenue ? r.revenue / totalRevenue : 0;
              return (
                <tr key={r.id}>
                  <th scope="row" className="px-3 py-3 ps-4 text-start text-sm font-medium sm:ps-5">
                    {pick(locale, r.nameEn, r.nameAr)}
                    {!r.isActive ? <span className="ms-2 text-[12px] font-normal text-ink-3">{t("dashboard.paused")}</span> : null}
                  </th>
                  <td className={td}>{num(locale, r.orders)}</td>
                  <td className={td}>{num(locale, r.open)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 flex-1 rounded-e-[3px] bg-card-recessed" aria-hidden>
                        <span className="block h-full rounded-e-[3px] bg-[var(--chart-neutral)]" style={{ width: `${share * 100}%` }} />
                      </span>
                      <span className="numerals shrink-0 text-[13.5px]">{money(locale, r.revenue)}</span>
                    </div>
                  </td>
                  <td className={td}>{r.paidInvoices ? money(locale, r.revenue / r.paidInvoices) : "—"}</td>
                  <td className={td}>
                    {r.turnaroundHours !== null ? t("dashboard.hours", { value: num(locale, r.turnaroundHours, 1) }) : "—"}
                  </td>
                  <td className={td}>{num(locale, r.failedStops)}</td>
                  <td className={td}>{r.rating !== null ? `${num(locale, r.rating, 1)} / 5` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
