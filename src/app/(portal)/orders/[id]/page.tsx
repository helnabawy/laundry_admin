import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  Camera,
  CircleAlert,
  CircleCheck,
  Crown,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { orderDetail, staffNamesById, vendorDrivers } from "@/server/queries/orders";
import { can } from "@/lib/permissions";
import { dateTime, money, pick } from "@/lib/format";
import { SlotWindow } from "@/components/orders/slot-window";
import { STATUS_ICON, STATUS_STOCK, STOCK_CLASSES } from "@/lib/stages";
import { invoiceTotals } from "@/domain/pricing";
import { OrderActions } from "@/components/orders/order-actions";
import { ProgressStrip } from "@/components/orders/progress-strip";
import { KindGlyph } from "@/components/orders/kind-glyph";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { StatusStamp } from "@/components/ui/status-stamp";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: PageProps<"/orders/[id]">) {
  const t = await getTranslations("orders");
  const session = await requirePage("orders.view");
  const order = await orderDetail(session, (await params).id);
  return { title: order ? t("orderTitle", { number: order.number }) : t("title") };
}

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const session = await requirePage("orders.view");
  const { id } = await params;
  const order = await orderDetail(session, id);
  if (!order) notFound();

  const t = await getTranslations();
  const locale = await getLocale();
  const canOperate = can(session.role, "orders.operate");
  const drivers = canOperate ? await vendorDrivers(order.vendorId) : [];
  const staffNames = await staffNamesById(
    order.events.filter((e) => e.actorType === "staff" && e.actorId).map((e) => e.actorId!),
  );

  const stock = STOCK_CLASSES[STATUS_STOCK[order.status]];
  const Icon = STATUS_ICON[order.status];
  const address = order.addressSnapshot as Record<string, string | number | null>;
  const invoice = order.invoice;
  const totals = invoice
    ? invoiceTotals({
        lines: invoice.items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
        tier: { surchargeType: "none", surchargeValue: 0 },
        vendorCodFee: 0,
      })
    : null;
  const total = invoice && totals ? totals.subtotal + Number(invoice.vipSurcharge) + Number(invoice.codFee) : null;
  const actionOrder = {
    id: order.id,
    number: order.number,
    kind: order.kind,
    status: order.status,
    pickupDriver: order.pickupDriver?.fullName ?? null,
    deliveryDriver: order.deliveryDriver?.fullName ?? null,
  };

  const actorName = (e: (typeof order.events)[number]) => {
    if (e.actorType === "staff") return staffNames.get(e.actorId ?? "") ?? t("timeline.staff");
    if (e.actorType === "driver")
      return (
        [order.pickupDriver, order.deliveryDriver].find((d) => d?.id === e.actorId)?.fullName ?? t("timeline.driver")
      );
    if (e.actorType === "customer") return order.customerName || t("timeline.customer");
    return t("timeline.system");
  };

  const mapHref =
    address.latitude && address.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`
      : null;

  return (
    <div className="flex min-w-0 flex-col gap-5 [&>*]:min-w-0">
      <Link href="/orders" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="flip-rtl size-4" aria-hidden />
        {t("orders.backToBoard")}
      </Link>

      {/* The ticket, full size */}
      <section className="ticket-notched rounded-ticket bg-card shadow-ticket" aria-labelledby="order-title">
        <div className={cn("flex h-[34px] items-center gap-2 rounded-t-ticket px-4 text-[13px] font-medium text-[#1d1d1f] sm:px-6", stock.band)}>
          <Icon className="size-4" aria-hidden />
          {t(`status.${order.status}`)}
          <span className="ms-auto flex items-center gap-3">
            {order.tier.isVip ? (
              <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#1d1d1f] px-1.5 text-[11px] leading-[18px] text-white">
                <Crown className="size-3" aria-hidden />
                {pick(locale, order.tier.nameEn, order.tier.nameAr)}
              </span>
            ) : null}
            <KindGlyph kind={order.kind} withLabel />
          </span>
        </div>
        <div className="perforation" aria-hidden />
        <div className="flex flex-col gap-6 px-4 pb-6 pt-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="order-title" className="numerals text-[44px] font-semibold leading-none tracking-[-0.04em] [font-stretch:85%]">
                <span className="sr-only">{t("orders.orderTitle", { number: "" })}</span>
                {order.number}
              </h1>
              <p className="mt-2 text-sm text-ink-2">
                {t("orders.placedOn", { date: dateTime(locale, order.createdAt) })}
                {session.vendorId ? null : <> · {pick(locale, order.vendor.nameEn, order.vendor.nameAr)}</>}
              </p>
            </div>
            {canOperate ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <OrderActions
                  order={actionOrder}
                  drivers={drivers}
                  canCancel={can(session.role, "orders.cancel")}
                  layout="detail"
                />
              </div>
            ) : null}
          </div>
          <ProgressStrip kind={order.kind} status={order.status} reached={order.events.map((e) => e.status)} />
          {order.status === "awaitingPayment" ? (
            <p className="rounded-control bg-pink-wash px-3 py-2.5 text-sm text-pink-ink">{t("orders.awaitingPaymentNote")}</p>
          ) : null}
          {order.status === "cancelled" && order.cancelReason ? (
            <p className="rounded-control bg-grey-wash px-3 py-2.5 text-sm text-grey-ink">
              {t("orders.cancelledBecause", { reason: order.cancelReason })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* What was asked / what was counted */}
          <Sheet>
            <SheetHeader title={invoice ? t("invoice.title", { number: invoice.number }) : t("orders.requested")} />
            {order.lines.length > 0 && !invoice ? (
              <ul className="divide-y divide-rule">
                {order.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="font-medium">{pick(locale, l.category.nameEn, l.category.nameAr)}</span>
                    <span className="text-sm text-ink-2">{pick(locale, l.subService.nameEn, l.subService.nameAr)}</span>
                  </li>
                ))}
                <li className="px-4 py-3 text-sm text-ink-3 sm:px-5">{t("orders.priceAfterCountLong")}</li>
              </ul>
            ) : null}
            {invoice && totals && total !== null ? (
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rule text-[12.5px] text-ink-3">
                      <th scope="col" className="px-4 py-2.5 text-start font-medium sm:px-5">{t("invoice.item")}</th>
                      <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("invoice.qty")}</th>
                      <th scope="col" className="px-3 py-2.5 text-end font-medium">{t("invoice.unit")}</th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium sm:px-5">{t("invoice.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((i) => (
                      <tr key={i.id} className="border-b border-rule">
                        <td className="px-4 py-2.5 sm:px-5">{pick(locale, i.nameEn, i.nameAr)}</td>
                        <td className="numerals px-3 py-2.5 text-end">{i.quantity}</td>
                        <td className="numerals px-3 py-2.5 text-end text-ink-2">{money(locale, Number(i.unitPrice))}</td>
                        <td className="numerals px-4 py-2.5 text-end sm:px-5">{money(locale, i.quantity * Number(i.unitPrice))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="ms-auto flex max-w-xs flex-col gap-1.5 px-4 py-4 text-sm sm:px-5">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-2">{t("invoice.subtotal")}</dt>
                    <dd className="numerals">{money(locale, totals.subtotal)}</dd>
                  </div>
                  {Number(invoice.vipSurcharge) > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-2">{t("invoice.vipSurcharge")}</dt>
                      <dd className="numerals">{money(locale, Number(invoice.vipSurcharge))}</dd>
                    </div>
                  ) : null}
                  {Number(invoice.codFee) > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-2">{t("invoice.codFee")}</dt>
                      <dd className="numerals">{money(locale, Number(invoice.codFee))}</dd>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between gap-4 border-t-2 border-ink pt-2 text-base font-semibold">
                    <dt>{t("invoice.total")}</dt>
                    <dd className="numerals">{money(locale, total)}</dd>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-ink-2">
                      {invoice.paymentMethod ? t(`payment.${invoice.paymentMethod}`) : t("payment.notChosen")}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-medium",
                        invoice.paid ? "bg-success-wash text-success" : "bg-danger-wash text-danger",
                      )}
                    >
                      {invoice.paid ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
                      {invoice.paid ? t("payment.paid") : t("payment.unpaid")}
                    </span>
                  </div>
                </dl>
                {invoice.note ? <p className="border-t border-rule px-4 py-3 text-sm text-ink-2 sm:px-5">{invoice.note}</p> : null}
              </div>
            ) : null}
          </Sheet>

          {order.kind === "WIZARD" && invoice ? (
            <Sheet>
              <SheetHeader title={t("conditions.title")} />
              {invoice.conditions.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-2 sm:px-5">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  {t("conditions.none")}
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {invoice.conditions.map((c) => (
                    <li key={c.id} className="flex gap-3 px-4 py-3 sm:px-5">
                      {c.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photoUrl} alt={t("conditions.photoOf", { item: c.itemName })} className="size-16 shrink-0 rounded-[4px] object-cover" />
                      ) : (
                        <span className="grid size-16 shrink-0 place-items-center rounded-[4px] bg-card-recessed text-ink-3">
                          <Camera className="size-5" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {c.itemName} · <span className={c.kind === "damage" ? "text-danger" : "text-canary-ink"}>{t(`conditions.${c.kind}`)}</span>
                        </p>
                        {c.note ? <p className="text-ink-2">{c.note}</p> : null}
                      </div>
                    </li>
                  ))}
                  <li className="px-4 py-2.5 text-[13px] text-ink-3 sm:px-5">
                    {invoice.conditionsAcknowledged ? t("conditions.acknowledged") : t("conditions.notAcknowledged")}
                  </li>
                </ul>
              )}
            </Sheet>
          ) : null}

          {order.failures.length > 0 ? (
            <Sheet>
              <SheetHeader title={t("failure.title")} />
              <ul className="divide-y divide-rule">
                {order.failures.map((f) => (
                  <li key={f.id} className="flex gap-3 px-4 py-3 sm:px-5">
                    {f.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.photoUrl} alt={t("failure.photo")} className="size-16 shrink-0 rounded-[4px] object-cover" />
                    ) : null}
                    <div className="text-sm">
                      <p className="font-medium">
                        {t(`failure.stage.${f.stage}`)} · {t(`failure.reason.${f.reason}`)}
                      </p>
                      {f.note ? <p className="text-ink-2">{f.note}</p> : null}
                      <p className="numerals mt-0.5 text-[12px] text-ink-3">{dateTime(locale, f.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : null}

          {order.rating ? (
            <Sheet>
              <SheetHeader title={t("orders.rating")} />
              <div className="flex flex-col gap-1 px-4 py-4 sm:px-5">
                <p className="flex items-center gap-1" aria-label={t("orders.stars", { count: order.rating.stars })}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={cn("size-4", i < order.rating!.stars ? "fill-ink text-ink" : "text-rule-strong")} aria-hidden />
                  ))}
                </p>
                {order.rating.comment ? <p className="text-sm text-ink-2">{order.rating.comment}</p> : null}
              </div>
            </Sheet>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          <Sheet>
            <SheetHeader title={t("orders.customer")} />
            <div className="flex flex-col gap-3 px-4 py-4 text-sm sm:px-5">
              <div>
                <p className="font-medium">{order.customerName || t("orders.noName")}</p>
                <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink" dir="ltr">
                  <Phone className="size-3.5" aria-hidden />
                  {order.customerPhone}
                </a>
                <p className="mt-1 text-[13px] text-ink-3">{t("orders.customerOrders", { count: order.customer._count.orders })}</p>
              </div>
              <div className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                <p className="text-ink-2">
                  {[address.building && t("orders.building", { value: address.building }), address.floor && t("orders.floor", { value: address.floor }), address.apartment && t("orders.apartment", { value: address.apartment })]
                    .filter(Boolean)
                    .join(" · ")}
                  <br />
                  {[address.area, address.city].filter(Boolean).join("، ")}
                  {mapHref ? (
                    <>
                      <br />
                      <a href={mapHref} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-rule-strong hover:decoration-ink">
                        {t("orders.openMap")}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("orders.schedule")} />
            <dl className="flex flex-col gap-3 px-4 py-4 text-sm sm:px-5">
              <div>
                <dt className="text-[12.5px] text-ink-3">{t("orders.pickup")}</dt>
                <dd className="numerals text-[13px]"><SlotWindow start={order.pickupStart} end={order.pickupEnd} /></dd>
                <dd className="text-ink-2">{order.pickupDriver?.fullName ?? t("orders.noDriver")}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">{t("orders.delivery")}</dt>
                <dd className="numerals text-[13px]"><SlotWindow start={order.deliveryStart} end={order.deliveryEnd} /></dd>
                <dd className="text-ink-2">{order.deliveryDriver?.fullName ?? t("orders.noDriver")}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">{t("orders.tier")}</dt>
                <dd>
                  {pick(locale, order.tier.nameEn, order.tier.nameAr)} · {t("orders.turnaround", { hours: order.tier.deliveryHours })}
                </dd>
              </div>
            </dl>
          </Sheet>

          <Sheet>
            <SheetHeader title={t("timeline.title")} />
            <ol className="flex flex-col px-4 py-4 sm:px-5">
              {order.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < order.events.length - 1 ? (
                    <span className="absolute start-[5px] top-4 h-[calc(100%-8px)] w-px bg-rule-strong" aria-hidden />
                  ) : null}
                  <span className={cn("mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-card ring-1 ring-rule-strong", STOCK_CLASSES[STATUS_STOCK[e.status]].dot)} aria-hidden />
                  <div className="min-w-0 text-sm">
                    <StatusStamp status={e.status} size="sm" />
                    <p className="mt-1 text-[12.5px] text-ink-2">
                      <span className="numerals text-[12px]">{dateTime(locale, e.at)}</span> · {actorName(e)}
                    </p>
                    {e.note ? <p className="text-[12.5px] text-ink-3">{e.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Sheet>
        </aside>
      </div>
    </div>
  );
}
