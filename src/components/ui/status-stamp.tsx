import { useTranslations } from "next-intl";
import type { OrderStatus } from "@/domain/order-workflow";
import { STATUS_ICON, STATUS_STOCK, STOCK_CLASSES } from "@/lib/stages";
import { cn } from "@/lib/cn";

/** Status as a stamped label: stock swatch + pictogram + words. */
export function StatusStamp({
  status,
  className,
  size = "md",
}: {
  status: OrderStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("status");
  const Icon = STATUS_ICON[status];
  const stock = STOCK_CLASSES[STATUS_STOCK[status]];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-current/15 font-medium",
        stock.wash,
        stock.ink,
        size === "sm" ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-[13px]",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      {t(status)}
    </span>
  );
}
