import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, CircleOff, MapPin, Phone } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { customerDetail } from "@/server/queries/customers";
import { dateTime, money, num, pick } from "@/lib/format";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { OrdersTable } from "@/components/orders/orders-table";
import { CustomerBlockButton } from "@/components/people/customer-block-button";
import { ClipboardList } from "lucide-react";

export async function generateMetadata({ params }: PageProps<"/users/[id]">) {
  const session = await requirePage("customers.manage");
  const detail = await customerDetail(session, (await params).id);
  const t = await getTranslations("users");
  return { title: detail?.customer.fullName || t("title") };
}

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const session = await requirePage("customers.manage");
  const { id } = await params;
  const detail = await customerDetail(session, id);
  if (!detail) notFound();
  const { customer, orders, orderCount, paidTotal } = detail;
  const t = await getTranslations();
  const locale = await getLocale();
  const name = customer.fullName || t("users.noName");
  const isDriver = customer.role === "driver";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Link href="/users" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="flip-rtl size-4" aria-hidden />
        {t("users.backToList")}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[26px] font-semibold tracking-[-0.015em]">
            {name}
            {!customer.isActive ? (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-danger-wash px-2 py-0.5 text-[13px] font-medium text-danger">
                <CircleOff className="size-3.5" aria-hidden />
                {t("users.blockedStatus")}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {t(`users.roles.${customer.role}`)}
            {customer.vendor ? <> · {pick(locale, customer.vendor.nameEn, customer.vendor.nameAr)}</> : null}
          </p>
          <a href={`tel:${customer.phone}`} className="numerals mt-1 inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink" dir="ltr">
            <Phone className="size-3.5" aria-hidden />
            {customer.phone}
          </a>
        </div>
        <CustomerBlockButton id={customer.id} name={name} isActive={customer.isActive} />
      </header>
      {!customer.isActive ? <p className="rounded-control bg-danger-wash px-3 py-2.5 text-sm text-danger">{t("users.blockedNote")}</p> : null}

      {/* Summary as a ruled receipt, like the dashboard's period ticket */}
      <section className="ticket-notched rounded-ticket bg-card shadow-ticket" aria-labelledby="summary-title">
        <div className="ticket-stub flex h-[34px] items-center rounded-t-ticket bg-grey px-4 text-[13px] font-medium text-[#1d1d1f] sm:px-5">
          <span id="summary-title">{t("users.summary")}</span>
        </div>
        <div className="perforation" aria-hidden />
        <dl className="grid gap-x-10 px-4 py-3 sm:px-5 md:grid-cols-3">
          {(isDriver
            ? [
                [t("users.stops"), num(locale, orderCount)],
                [t("users.joined"), dateTime(locale, customer.createdAt, "date")],
              ]
            : [
                [t("users.orders"), num(locale, orderCount)],
                [t("users.paid"), money(locale, paidTotal)],
                [t("users.joined"), dateTime(locale, customer.createdAt, "date")],
              ]
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5 border-b border-dashed border-rule py-2.5 last:border-b-0 md:border-b-0">
              <dt className="shrink-0 text-sm text-ink-2">{label}</dt>
              <span className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-rule-strong" aria-hidden />
              <dd className="numerals shrink-0 text-[17px] font-semibold tracking-[-0.03em] [font-stretch:88%]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Sheet className="min-w-0">
          <SheetHeader title={isDriver ? t("users.recentStops") : t("users.recentOrders")} />
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("users.noOrders")} />
          ) : (
            <OrdersTable rows={orders} showVendor={!session.vendorId} />
          )}
        </Sheet>
        {isDriver ? null : (
        <Sheet>
          <SheetHeader title={t("users.addresses")} />
          {customer.addresses.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-3 sm:px-5">{t("users.noAddresses")}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {customer.addresses.map((a) => (
                <li key={a.id} className="flex gap-2 px-4 py-3 text-sm sm:px-5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="text-ink-2">
                    <span className="block font-medium text-ink">{a.label || t(`users.addressKind.${a.kind}`)}</span>
                    {[a.building && t("orders.building", { value: a.building }), a.floor && t("orders.floor", { value: a.floor }), a.apartment && t("orders.apartment", { value: a.apartment })]
                      .filter(Boolean)
                      .join(" · ")}
                    <br />
                    {[a.area, a.city].filter(Boolean).join("، ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
        )}
      </div>
    </div>
  );
}
