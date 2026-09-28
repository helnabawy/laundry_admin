"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PATHS, type OrderKind, type OrderStatus } from "@/domain/order-workflow";
import { STATUS_ICON, STATUS_STOCK, STOCK_CLASSES } from "@/lib/stages";
import { cn } from "@/lib/cn";

/**
 * The order's line: each stop on its path, with done / here / ahead. Shop
 * orders ride a shorter line (no inspection, no payment wait).
 */
export function ProgressStrip({
  kind,
  status,
  reached,
}: {
  kind: OrderKind;
  status: OrderStatus;
  reached: OrderStatus[];
}) {
  const t = useTranslations("status");
  const tOrders = useTranslations("orders");
  const path = PATHS[kind];
  const currentIndex = path.indexOf(status);
  const offPath = currentIndex === -1;
  const lastReached = offPath ? Math.max(...reached.map((s) => path.indexOf(s))) : currentIndex;
  const list = useRef<HTMLOListElement>(null);
  const focusIndex = Math.max(0, lastReached);

  // On narrow screens, bring the current stop into view.
  useEffect(() => {
    const ol = list.current;
    const item = ol?.children[focusIndex] as HTMLElement | undefined;
    if (!ol || !item || ol.scrollWidth <= ol.clientWidth) return;
    item.scrollIntoView({ inline: "center", block: "nearest" });
  }, [focusIndex]);

  return (
    <div>
    <p className="numerals mb-2 text-[12px] text-ink-3 sm:hidden">
      <span className="font-sans">{tOrders("stageOf", { current: focusIndex + 1, total: path.length })}</span>
    </p>
    <ol ref={list} className="relative flex overflow-x-auto pb-1" aria-label={t("progress")}>
      {path.map((stop, i) => {
        const done = i < lastReached || (i === lastReached && stop === "delivered");
        const here = !offPath && i === currentIndex && stop !== "delivered";
        const Icon = STATUS_ICON[stop];
        const stock = STOCK_CLASSES[STATUS_STOCK[stop]];
        return (
          <li key={stop} className="flex min-w-[7.5rem] flex-1 flex-col gap-2" aria-current={here ? "step" : undefined}>
            <div className="flex items-center">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border-2",
                  done && "border-ink bg-ink text-card",
                  here && cn("border-ink text-[#1d1d1f]", stock.band),
                  !done && !here && "border-rule-strong bg-card text-ink-3",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
              </span>
              {i < path.length - 1 ? (
                <span className={cn("h-0.5 flex-1", i < lastReached ? "bg-ink" : "bg-rule-strong")} aria-hidden />
              ) : null}
            </div>
            <span className={cn("pe-2 text-[12.5px] leading-snug", here ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3")}>
              {t(stop)}
              <span className="sr-only">
                {" "}
                {done ? t("stepDone") : here ? t("stepCurrent") : t("stepAhead")}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
    </div>
  );
}
