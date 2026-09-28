import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, SearchX } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import {
  parseReportFilters,
  reportFilterOptions,
  reportPage,
  reportQueryString,
  reportSummary,
} from "@/server/queries/reports";
import { ORDER_STATUSES } from "@/domain/order-workflow";
import { localDateOf } from "@/domain/slots";
import { dateTime, money, num, pick } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { StatusStamp } from "@/components/ui/status-stamp";
import { EmptyState } from "@/components/ui/empty-state";
import { KindGlyph } from "@/components/orders/kind-glyph";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("reports");
  return { title: t("title") };
}

function presets() {
  const now = new Date();
  const today = localDateOf(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstOfMonth = `${y}-${pad(m)}-01`;
  const lastMonthStart = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  const lastMonthEnd = localDateOf(new Date(Date.parse(`${firstOfMonth}T12:00:00+04:00`) - 86_400_000));
  // UAE weeks start on Monday.
  const dow = (new Date(`${today}T12:00:00+04:00`).getUTCDay() + 6) % 7;
  const weekStart = localDateOf(new Date(now.getTime() - dow * 86_400_000));
  return [
    { key: "presetToday", from: today, to: today },
    { key: "presetWeek", from: weekStart, to: today },
    { key: "presetMonth", from: firstOfMonth, to: today },
    { key: "presetLastMonth", from: lastMonthStart, to: lastMonthEnd },
  ];
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requirePage("reports.view");
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const f = parseReportFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const [options, result, summary] = await Promise.all([reportFilterOptions(), reportPage(f, page), reportSummary(f)]);
  const qs = (extra: Record<string, string> = {}) => reportQueryString(f, extra);

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/admin/reports/export?${qs({ format: "csv" })}`} download>
                <Download aria-hidden /> {t("reports.exportCsv")}
              </a>
            </Button>
            <Button asChild variant="stamp">
              <a href={`/api/admin/reports/export?${qs({ format: "xlsx" })}`} download>
                <FileSpreadsheet aria-hidden /> {t("reports.exportXlsx")}
              </a>
            </Button>
          </>
        }
      />

      <Sheet className="mb-5">
        <SheetHeader
          title={t("reports.filters")}
          actions={
            <Link href="/reports" className="text-sm text-ink-2 underline decoration-rule-strong hover:text-ink">
              {t("common.reset")}
            </Link>
          }
        />
        <form action="/reports" className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-3">{t("reports.presets")}</span>
            {presets().map((p) => (
              <Link
                key={p.key}
                href={`/reports?${reportQueryString({ ...f, from: p.from, to: p.to })}`}
                className={cn(
                  "rounded-control px-2.5 py-1 text-[13px] font-medium",
                  f.from === p.from && f.to === p.to ? "bg-stamp text-on-stamp" : "bg-card-recessed text-ink-2 hover:text-ink",
                )}
              >
                {t(`reports.${p.key}`)}
              </Link>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Field label={t("reports.from")} htmlFor="r-from">
              <Input id="r-from" type="date" name="from" defaultValue={f.from} dir="ltr" className="numerals" />
            </Field>
            <Field label={t("reports.to")} htmlFor="r-to">
              <Input id="r-to" type="date" name="to" defaultValue={f.to} dir="ltr" className="numerals" />
            </Field>
            <Field label={t("reports.laundry")} htmlFor="r-vendor">
              <Select id="r-vendor" name="vendor" defaultValue={f.vendorId ?? ""}>
                <option value="">{t("reports.laundryAny")}</option>
                {options.vendors.map((v) => (
                  <option key={v.id} value={v.id}>{pick(locale, v.nameEn, v.nameAr)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("reports.status")} htmlFor="r-status">
              <Select id="r-status" name="status" defaultValue={f.status ?? ""}>
                <option value="">{t("orders.allStatuses")}</option>
                <option value="active">{t("orders.activeOnly")}</option>
                <option value="done">{t("orders.finishedOnly")}</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("reports.kind")} htmlFor="r-kind">
              <Select id="r-kind" name="kind" defaultValue={f.kind ?? ""}>
                <option value="">{t("orders.allKinds")}</option>
                <option value="SHOP">{t("kind.SHOP")}</option>
                <option value="WIZARD">{t("kind.WIZARD")}</option>
              </Select>
            </Field>
            <Field label={t("reports.payment")} htmlFor="r-pay">
              <Select id="r-pay" name="payment" defaultValue={f.paymentMethod ?? ""}>
                <option value="">{t("reports.paymentAny")}</option>
                <option value="card">{t("payment.card")}</option>
                <option value="cashOnDelivery">{t("payment.cashOnDelivery")}</option>
                <option value="none">{t("reports.paymentNone")}</option>
              </Select>
            </Field>
            <Field label={t("reports.paid")} htmlFor="r-paid">
              <Select id="r-paid" name="paid" defaultValue={f.paid === undefined ? "" : f.paid ? "yes" : "no"}>
                <option value="">{t("reports.paidAny")}</option>
                <option value="yes">{t("reports.paidYes")}</option>
                <option value="no">{t("reports.paidNo")}</option>
              </Select>
            </Field>
            <Field label={t("reports.tier")} htmlFor="r-tier">
              <Select id="r-tier" name="tier" defaultValue={f.tierId ?? ""}>
                <option value="">{t("reports.tierAny")}</option>
                {options.tiers.map((x) => (
                  <option key={x.id} value={x.id}>{pick(locale, x.nameEn, x.nameAr)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("reports.driver")} htmlFor="r-driver">
              <Select id="r-driver" name="driver" defaultValue={f.driverId ?? ""}>
                <option value="">{t("reports.driverAny")}</option>
                {options.drivers.map((x) => (
                  <option key={x.id} value={x.id}>{x.fullName ?? x.phone}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("reports.category")} htmlFor="r-cat">
              <Select id="r-cat" name="category" defaultValue={f.categoryId ?? ""}>
                <option value="">{t("reports.categoryAny")}</option>
                {options.categories.map((x) => (
                  <option key={x.id} value={x.id}>{pick(locale, x.nameEn, x.nameAr)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("common.search")} htmlFor="r-q" className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <Input id="r-q" name="q" defaultValue={f.q} placeholder={t("orders.searchPlaceholder")} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="stamp">{t("common.apply")}</Button>
          </div>
        </form>
      </Sheet>

      <Sheet className="mb-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            [t("reports.orders"), num(locale, summary.orders)],
            [t("reports.delivered"), num(locale, summary.delivered)],
            [t("reports.cancelled"), num(locale, summary.failedOrCancelled)],
            [t("reports.invoiced"), money(locale, summary.invoiced)],
            [t("reports.collected"), money(locale, summary.collected)],
            [t("reports.outstanding"), money(locale, summary.outstanding)],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-e border-rule px-4 py-4 sm:px-5 xl:border-b-0 xl:[&:last-child]:border-e-0">
              <dt className="text-[12.5px] text-ink-2">{label}</dt>
              <dd className="numerals mt-1 text-[19px] font-semibold tracking-[-0.03em] [font-stretch:88%]">{value}</dd>
            </div>
          ))}
        </dl>
      </Sheet>

      <Sheet>
        <SheetHeader title={t("reports.results")} actions={<span className="text-sm text-ink-2">{t("common.resultsCount", { count: num(locale, result.total) })}</span>} />
        {result.rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("reports.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("orders.number")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("reports.created")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("orders.status")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("orders.kind")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("orders.laundry")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("reports.customer")}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("reports.payment")}</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium sm:px-5">{t("reports.total")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-card-recessed">
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link href={`/orders/${r.id}`} className="numerals font-semibold hover:underline">{r.number}</Link>
                    </td>
                    <td className="numerals px-3 py-2.5 text-[12.5px] text-ink-2">{dateTime(locale, r.createdAt)}</td>
                    <td className="px-3 py-2.5"><StatusStamp status={r.status} size="sm" /></td>
                    <td className="px-3 py-2.5 text-ink-2"><KindGlyph kind={r.kind} withLabel /></td>
                    <td className="px-3 py-2.5 text-ink-2">{pick(locale, r.vendor.en, r.vendor.ar)}</td>
                    <td className="max-w-48 px-3 py-2.5">
                      <span className="block truncate">{r.customerName || "—"}</span>
                      <span className="block text-[12px] text-ink-3" dir="ltr">{r.customerPhone}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-ink-2">
                      {r.paymentMethod ? t(`payment.${r.paymentMethod}`) : "—"}
                      {r.paid !== null ? (
                        <span className={cn("block text-[12px]", r.paid ? "text-success" : "text-danger")}>
                          {r.paid ? t("payment.paid") : t("payment.unpaid")}
                        </span>
                      ) : null}
                    </td>
                    <td className="numerals px-4 py-2.5 text-end sm:px-5">{r.total !== null ? money(locale, r.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
      <nav className="mt-4 flex items-center justify-end gap-2" aria-label={t("common.pagination")}>
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports?${qs({ page: String(Math.max(1, page - 1)) })}`} className={cn(page <= 1 && "pointer-events-none opacity-45")}>
            <ChevronLeft className="flip-rtl" aria-hidden /> {t("common.previous")}
          </Link>
        </Button>
        <span className="numerals text-[13px] text-ink-2">{page} / {result.pages}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports?${qs({ page: String(Math.min(result.pages, page + 1)) })}`} className={cn(page >= result.pages && "pointer-events-none opacity-45")}>
            {t("common.next")} <ChevronRight className="flip-rtl" aria-hidden />
          </Link>
        </Button>
      </nav>
    </>
  );
}
