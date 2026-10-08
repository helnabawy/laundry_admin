"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateTime, money, num } from "@/lib/format";
import type { FinanceDay } from "@/server/queries/finance";

const axis = { fontSize: 11, fill: "var(--ink-3)", fontFamily: "var(--font-martian)" };
const dayLabel = (locale: string, date: string) => dateTime(locale, `${date}T12:00:00+04:00`, "short");

const SERIES = {
  netRevenue: "var(--chart-quick)",
  costs: "var(--chart-neutral-soft)",
  profit: "var(--ink)",
};

/** Money in vs money out per day, with the day's profit as a line. */
export function ProfitPerDay({ data }: { data: FinanceDay[] }) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const rtl = locale === "ar";
  const rows = data.map((d) => ({ ...d, costs: Math.round((d.fees + d.expenses) * 100) / 100 }));
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12.5px] text-ink-2" aria-hidden>
        <Legend color={SERIES.netRevenue} label={t("netRevenue")} />
        <Legend color={SERIES.costs} label={t("costs")} />
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: SERIES.profit }} /> {t("profit")}
        </span>
      </div>
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -2 }} barGap={1} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="var(--rule)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => dayLabel(locale, d)}
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: "var(--rule-strong)" }}
              reversed={rtl}
              minTickGap={24}
            />
            <YAxis tick={axis} tickLine={false} axisLine={false} orientation={rtl ? "right" : "left"} tickFormatter={(v) => num(locale, v)} />
            <ReferenceLine y={0} stroke="var(--rule-strong)" />
            <Tooltip
              cursor={{ fill: "var(--card-recessed)" }}
              content={({ active, payload, label }) => {
                const d = active && payload?.length ? (payload[0]?.payload as (typeof rows)[number]) : null;
                if (!d) return null;
                return (
                  <div className="rounded-control border border-rule bg-card px-3 py-2 text-[12.5px] text-ink shadow-lift">
                    <p className="mb-1 font-medium">{dayLabel(locale, String(label))}</p>
                    {[
                      [t("netRevenue"), d.netRevenue, SERIES.netRevenue],
                      [t("fees"), d.fees, SERIES.costs],
                      [t("expenses"), d.expenses, SERIES.costs],
                      [t("profit"), d.profit, SERIES.profit],
                    ].map(([l, v, c]) => (
                      <p key={String(l)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-ink-2">
                          <span className="size-2.5 rounded-[2px]" style={{ background: String(c) }} aria-hidden />
                          {l}
                        </span>
                        <span className="numerals">{money(locale, Number(v))}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Bar isAnimationActive={false} dataKey="netRevenue" fill={SERIES.netRevenue} radius={[3, 3, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="costs" fill={SERIES.costs} radius={[3, 3, 0, 0]} />
            <Line isAnimationActive={false} type="monotone" dataKey="profit" stroke={SERIES.profit} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-[12.5px]">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">{t("chartTable")}</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr className="text-ink-3">
                <th className="py-1 text-start font-medium">{t("date")}</th>
                <th className="py-1 text-end font-medium">{t("netRevenue")}</th>
                <th className="py-1 text-end font-medium">{t("fees")}</th>
                <th className="py-1 text-end font-medium">{t("expenses")}</th>
                <th className="py-1 text-end font-medium">{t("profit")}</th>
              </tr>
            </thead>
            <tbody className="numerals">
              {rows.map((d) => (
                <tr key={d.date} className="border-t border-rule">
                  <td className="py-1">{dayLabel(locale, d.date)}</td>
                  <td className="py-1 text-end">{money(locale, d.netRevenue)}</td>
                  <td className="py-1 text-end">{money(locale, d.fees)}</td>
                  <td className="py-1 text-end">{money(locale, d.expenses)}</td>
                  <td className="py-1 text-end">{money(locale, d.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[2px]" style={{ background: color }} /> {label}
    </span>
  );
}
