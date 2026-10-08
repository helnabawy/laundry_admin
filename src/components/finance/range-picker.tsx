import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RANGE_PRESETS, type FinanceRange } from "@/server/queries/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Preset ranges as links, plus a from/to form for anything else (plain GET). */
export async function RangePicker({
  path,
  range,
  preset,
  extra = {},
}: {
  path: string;
  range: FinanceRange;
  preset: number | null;
  extra?: Record<string, string | undefined>;
}) {
  const t = await getTranslations("finance");
  const keep = Object.entries(extra).filter((e): e is [string, string] => !!e[1]);
  const href = (days: number) => `${path}?${new URLSearchParams([["range", String(days)], ...keep])}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-control bg-counter-deep p-1" role="group" aria-label={t("range")}>
        {RANGE_PRESETS.map((d) => (
          <Link
            key={d}
            href={href(d)}
            aria-current={d === preset ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-[6px] px-3 text-sm font-medium",
              d === preset ? "bg-card text-ink shadow-ticket" : "text-ink-2 hover:text-ink",
            )}
          >
            {t("lastDays", { days: d })}
          </Link>
        ))}
      </div>
      <form action={path} className="flex flex-wrap items-center gap-2">
        {keep.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="sr-only" htmlFor="range-from">{t("from")}</label>
        <Input id="range-from" type="date" name="from" defaultValue={range.from} className="h-9 w-[9.5rem]" />
        <span className="text-ink-3" aria-hidden>–</span>
        <label className="sr-only" htmlFor="range-to">{t("to")}</label>
        <Input id="range-to" type="date" name="to" defaultValue={range.to} className="h-9 w-[9.5rem]" />
        <Button type="submit" size="sm">{t("apply")}</Button>
      </form>
    </div>
  );
}
