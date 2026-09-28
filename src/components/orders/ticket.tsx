"use client";

import { useState, ViewTransition } from "react";
import Link from "next/link";
import { useLocale, useNow, useTranslations } from "next-intl";
import { Crown, Package, Timer, UserRound } from "lucide-react";
import type { TicketView, DriverOption } from "@/server/queries/orders";
import { STATUS_ICON, STATUS_STOCK, STOCK_CLASSES, WAIT_BUDGET_HOURS } from "@/lib/stages";
import { elapsedParts, isolate, money, pick } from "@/lib/format";
import { SlotWindow } from "./slot-window";
import { cn } from "@/lib/cn";
import { KindGlyph } from "./kind-glyph";
import { OrderActions } from "./order-actions";

/**
 * One order as its claim ticket: stock band + perforated stub, the number in
 * numbering-machine digits, what it's waiting for and for how long, and the
 * stamp for its one legal next step.
 */
export function Ticket({
  ticket,
  drivers,
  canCancel,
  canOperate,
}: {
  ticket: TicketView;
  drivers: DriverOption[];
  canCancel: boolean;
  canOperate: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const now = useNow({ updateInterval: 30_000 });
  const [tearing, setTearing] = useState(false);

  const stock = STOCK_CLASSES[STATUS_STOCK[ticket.status]];
  const Icon = STATUS_ICON[ticket.status];
  const waitedMs = now.getTime() - new Date(ticket.since).getTime();
  const budget = WAIT_BUDGET_HOURS[ticket.status];
  const overdue = budget !== undefined && waitedMs > budget * 3_600_000;
  const late = budget !== undefined && waitedMs > budget * 2 * 3_600_000;
  const waited = elapsedParts(waitedMs);
  const waitedLabel = t(`common.duration.${waited.key}`, waited.values);

  const deliveryLeg = ticket.status === "outForDelivery" || ticket.status === "deliveryFailed" || ticket.status === "processing";
  const driver = deliveryLeg ? ticket.deliveryDriver : ticket.pickupDriver;

  return (
    <ViewTransition name={`ticket-${ticket.id}`} share="ticket-move" default="none">
    <article
      className={cn(
        "ticket-notched relative rounded-ticket bg-card shadow-ticket transition-shadow hover:shadow-lift",
        tearing && "ticket-tearing",
      )}
      aria-labelledby={`ticket-${ticket.id}`}
    >
      {/* Stub: stock band with the status in words and pictogram */}
      <div
        className={cn(
          "ticket-stub flex h-[34px] items-center gap-2 rounded-t-ticket px-3 text-[12.5px] font-medium text-[#1d1d1f]",
          stock.band,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t(`status.${ticket.status}`)}</span>
        <span className="ms-auto flex items-center gap-1.5">
          {ticket.isVip ? (
            <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#1d1d1f] px-1.5 text-[11px] leading-[18px] text-white">
              <Crown className="size-3" aria-hidden />
              {pick(locale, ticket.tierName.en, ticket.tierName.ar)}
            </span>
          ) : null}
          <KindGlyph kind={ticket.kind} />
        </span>
      </div>
      <div className="perforation" aria-hidden />

      <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h3 id={`ticket-${ticket.id}`} className="min-w-0">
            <Link
              href={`/orders/${ticket.id}`}
              className="numerals block text-[32px] font-semibold leading-none tracking-[-0.04em] [font-stretch:84%] after:absolute after:inset-0 after:content-[''] hover:underline hover:decoration-2 hover:underline-offset-4"
              aria-label={t("orders.openOrder", { number: ticket.number })}
            >
              {ticket.number}
            </Link>
          </h3>
          <span
            className={cn(
              "numerals relative inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px]",
              late
                ? "bg-danger text-white font-bold dark:text-[#1b0a07]"
                : overdue
                  ? "bg-danger-wash text-danger font-bold"
                  : "text-ink-2",
            )}
            title={t("orders.waitingFor", { time: waitedLabel })}
            suppressHydrationWarning
          >
            <Timer className="size-3.5" aria-hidden />
            <span className="sr-only">{overdue ? t("orders.overdue") : t("orders.waiting")}</span>
            {waitedLabel}
          </span>
        </div>

        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{ticket.customerName || t("orders.noName")}</p>
          <p className="truncate text-[13px] text-ink-3">
            {ticket.area}
            {ticket.area ? " · " : ""}
            <span dir="ltr">{ticket.customerPhone}</span>
          </p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
          <dt className="text-ink-3">{deliveryLeg ? t("orders.delivery") : t("orders.pickup")}</dt>
          <dd className="numerals text-[12px] leading-snug [font-stretch:87%]">
            {deliveryLeg ? (
              <SlotWindow start={ticket.deliveryStart} end={ticket.deliveryEnd} />
            ) : (
              <SlotWindow start={ticket.pickupStart} end={ticket.pickupEnd} />
            )}
          </dd>
          <dt className="text-ink-3">
            <UserRound className="inline size-3.5" aria-hidden />
            <span className="sr-only">{t("orders.driver")}</span>
          </dt>
          <dd className="truncate">{driver ?? <span className="text-ink-3">{t("orders.noDriver")}</span>}</dd>
          <dt className="text-ink-3">
            <Package className="inline size-3.5" aria-hidden />
            <span className="sr-only">{t("orders.items")}</span>
          </dt>
          <dd className="flex items-center justify-between gap-2">
            <span>
              {ticket.kind === "SHOP" || ticket.total !== null
                ? t("orders.itemCount", { count: ticket.itemCount })
                : t("orders.serviceCount", { count: ticket.itemCount })}
            </span>
            {ticket.total !== null ? (
              <span className="numerals text-[12.5px] font-semibold text-ink">{money(locale, ticket.total)}</span>
            ) : (
              <span className="text-ink-3">{t("orders.priceAfterCount")}</span>
            )}
          </dd>
        </dl>

        {canOperate ? (
          <div className="relative z-10">
            <OrderActions
              order={ticket}
              drivers={drivers}
              canCancel={canCancel}
              onAdvance={() => {
                setTearing(true);
                setTimeout(() => setTearing(false), 420);
              }}
              onRevert={() => setTearing(false)}
            />
            <WaitingOn status={ticket.status} driver={driver} />
          </div>
        ) : null}
      </div>
    </article>
    </ViewTransition>
  );
}

/** When nothing is the laundry's to do, say who the order waits on. */
function WaitingOn({ status, driver }: { status: TicketView["status"]; driver: string | null }) {
  const t = useTranslations("orders");
  const text =
    status === "driverAssigned"
      ? t("waitingOnPickup", { driver: isolate(driver ?? "") })
      : status === "awaitingPayment"
        ? t("waitingOnCustomer")
        : status === "outForDelivery"
          ? t("waitingOnDelivery", { driver: isolate(driver ?? "") })
          : null;
  if (!text) return null;
  return <p className="mt-2 rounded-control bg-card-recessed px-2.5 py-2 text-[12.5px] text-ink-2">{text}</p>;
}
