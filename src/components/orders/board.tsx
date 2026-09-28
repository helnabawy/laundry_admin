"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BOARD_COLUMNS, type BoardColumnId, type OrderStatus } from "@/domain/order-workflow";
import type { DriverOption, TicketView } from "@/server/queries/orders";
import { STATUS_ICON, STATUS_STOCK, STOCK_CLASSES } from "@/lib/stages";
import { cn } from "@/lib/cn";
import { Ticket } from "./ticket";

export type StageNames = Record<BoardColumnId, { en: string; ar: string; hintEn: string; hintAr: string }>;

/**
 * The rack. A stage rail across the top names every stage in both languages
 * with its count, so nothing hides off-screen; below it, the busy stages as
 * columns sized so a whole number of them always fits. On phones the rail
 * is the stage picker and one column shows at a time.
 */
export function Board({
  tickets,
  driversByVendor,
  canCancel,
  canOperate,
  stageNames,
}: {
  tickets: TicketView[];
  driversByVendor: Record<string, DriverOption[]>;
  canCancel: boolean;
  canOperate: boolean;
  stageNames: StageNames;
}) {
  const t = useTranslations("stage");
  const locale = useLocale();
  const other = locale === "ar" ? "en" : "ar";
  const rack = useRef<HTMLDivElement>(null);

  const byColumn = new Map<BoardColumnId, TicketView[]>();
  for (const col of BOARD_COLUMNS) byColumn.set(col.id, []);
  for (const ticket of tickets) {
    const col = BOARD_COLUMNS.find((c) => (c.statuses as readonly OrderStatus[]).includes(ticket.status));
    if (col) byColumn.get(col.id)!.push(ticket);
  }
  const busy = BOARD_COLUMNS.filter((c) => byColumn.get(c.id)!.length > 0);
  const [selected, setSelected] = useState<BoardColumnId>(busy[0]?.id ?? "new");

  const goTo = (id: BoardColumnId) => {
    setSelected(id);
    const el = rack.current?.querySelector<HTMLElement>(`[data-column="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <div className="board-root flex flex-col gap-4">
      {/* Stage rail: every stage, both languages, always visible */}
      <div
        className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5 md:mx-0 md:grid md:grid-cols-8 md:gap-0 md:overflow-visible md:rounded-ticket md:bg-card md:p-0 md:shadow-ticket"
        role="tablist"
        aria-label={t("stages")}
      >
        {BOARD_COLUMNS.map((col, i) => {
          const stock = STOCK_CLASSES[STATUS_STOCK[col.statuses[0]]];
          const Icon = STATUS_ICON[col.statuses[0]];
          const count = byColumn.get(col.id)!.length;
          const names = stageNames[col.id];
          const active = selected === col.id;
          return (
            <button
              key={col.id}
              role="tab"
              aria-selected={active}
              aria-label={`${names[locale as "en" | "ar"]}, ${count}`}
              onClick={() => goTo(col.id)}
              className={cn(
                "relative flex shrink-0 flex-col items-start gap-0.5 rounded-control px-3 pb-2.5 pt-3 text-start transition-colors md:rounded-none md:border-e md:border-rule md:last:border-e-0",
                "bg-card shadow-ticket md:bg-transparent md:shadow-none",
                i === 0 && "md:rounded-s-ticket",
                i === BOARD_COLUMNS.length - 1 && "md:rounded-e-ticket",
                active ? "ring-2 ring-ink md:ring-0 md:bg-card-recessed" : "hover:bg-card-recessed",
                count === 0 && "opacity-60",
              )}
            >
              <span className={cn("absolute inset-x-0 top-0 h-1 md:rounded-none", stock.band, "rounded-t-control")} aria-hidden />
              <span className="flex w-full items-center justify-between gap-2">
                <Icon className="size-4 text-ink-2" aria-hidden />
                <span className="numerals text-[22px] font-semibold leading-none tracking-[-0.04em] [font-stretch:82%]">{count}</span>
              </span>
              <span className="mt-1 text-[13px] font-semibold leading-tight">{names[locale as "en" | "ar"]}</span>
              <span className="text-[11.5px] leading-tight text-ink-3" lang={other} dir={other === "ar" ? "rtl" : "ltr"}>
                {names[other]}
              </span>
            </button>
          );
        })}
      </div>

      {busy.length === 0 ? (
        <p className="rounded-ticket border border-dashed border-rule-strong px-4 py-10 text-center text-sm text-ink-3">
          {t("emptyColumn")}
        </p>
      ) : (
        <div
          ref={rack}
          className="rack snap-x snap-mandatory overflow-x-auto pb-4"
          style={{ "--count": busy.length } as React.CSSProperties}
        >
          <div className="flex gap-4">
            {busy.map((col) => {
              const items = byColumn.get(col.id)!;
              const stock = STOCK_CLASSES[STATUS_STOCK[col.statuses[0]]];
              const names = stageNames[col.id];
              return (
                <section
                  key={col.id}
                  data-column={col.id}
                  aria-labelledby={`col-${col.id}`}
                  className={cn("rack-col shrink-0 snap-start", selected === col.id ? "block" : "hidden md:block")}
                >
                  <header className="mb-3 border-b-2 border-ink/80 pb-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 id={`col-${col.id}`} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
                        <span className={cn("h-3.5 w-2.5 shrink-0 rounded-[2px]", stock.dot)} aria-hidden />
                        <span className="truncate">{names[locale as "en" | "ar"]}</span>
                        <span className="truncate text-[12px] font-normal text-ink-3" lang={other} dir={other === "ar" ? "rtl" : "ltr"}>
                          {names[other]}
                        </span>
                      </h2>
                      <span className="numerals text-[20px] font-semibold leading-none tracking-[-0.04em] [font-stretch:82%]">
                        {items.length}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
                      {locale === "ar" ? names.hintAr : names.hintEn}
                    </p>
                  </header>
                  <ol className="flex flex-col gap-3">
                    {items.map((ticket) => (
                      <li key={ticket.id}>
                        <Ticket
                          ticket={ticket}
                          drivers={driversByVendor[ticket.vendorId] ?? []}
                          canCancel={canCancel}
                          canOperate={canOperate}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
