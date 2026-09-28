"use client";

import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateTime, money, num } from "@/lib/format";

interface Day {
  date: string;
  shop: number;
  quick: number;
  revenue: number;
}

const axis = { fontSize: 11, fill: "var(--ink-3)", fontFamily: "var(--font-martian)" };

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-control border border-rule bg-card px-3 py-2 text-[12.5px] text-ink shadow-lift">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color ? <span className="size-2.5 rounded-[2px]" style={{ background: r.color }} aria-hidden /> : null}
            {r.label}
          </span>
          <span className="numerals">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const dayLabel = (locale: string, date: string) => dateTime(locale, `${date}T12:00:00+04:00`, "short");

export function OrdersPerDay({ data }: { data: Day[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const rtl = locale === "ar";
  return (
    <figure>
      <div className="mb-3 flex items-center gap-4 text-[12.5px] text-ink-2" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-[var(--chart-shop)]" /> {t("shop")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-[var(--chart-quick)]" /> {t("quick")}
        </span>
      </div>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
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
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} orientation={rtl ? "right" : "left"} />
            <Tooltip
              cursor={{ fill: "var(--card-recessed)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={dayLabel(locale, String(label))}
                    rows={[
                      { label: t("shop"), value: num(locale, Number(payload[0]?.payload.shop)), color: "var(--chart-shop)" },
                      { label: t("quick"), value: num(locale, Number(payload[0]?.payload.quick)), color: "var(--chart-quick)" },
                    ]}
                  />
                ) : null
              }
            />
            <Bar isAnimationActive={false} dataKey="shop" stackId="o" fill="var(--chart-shop)" stroke="var(--card)" strokeWidth={1} />
            <Bar isAnimationActive={false} dataKey="quick" stackId="o" fill="var(--chart-quick)" stroke="var(--card)" strokeWidth={1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DayTable data={data} kind="orders" />
    </figure>
  );
}

export function RevenuePerDay({ data }: { data: Day[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const rtl = locale === "ar";
  return (
    <figure>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -6 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-neutral)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-neutral)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Tooltip
              cursor={{ stroke: "var(--rule-strong)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={dayLabel(locale, String(label))}
                    rows={[{ label: t("revenue"), value: money(locale, Number(payload[0]?.value)), color: "var(--chart-neutral)" }]}
                  />
                ) : null
              }
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="revenue"
              stroke="var(--chart-neutral)"
              strokeWidth={2}
              fill="url(#rev)"
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DayTable data={data} kind="revenue" />
    </figure>
  );
}

function DayTable({ data, kind }: { data: Day[]; kind: "orders" | "revenue" }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  return (
    <details className="mt-2 text-[12.5px]">
      <summary className="cursor-pointer text-ink-3 hover:text-ink">{t("chartTable")}</summary>
      <div className="mt-2 max-h-56 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 text-start font-medium">{t("date")}</th>
              {kind === "orders" ? (
                <>
                  <th className="py-1 text-end font-medium">{t("shop")}</th>
                  <th className="py-1 text-end font-medium">{t("quick")}</th>
                </>
              ) : (
                <th className="py-1 text-end font-medium">{t("amount")}</th>
              )}
            </tr>
          </thead>
          <tbody className="numerals">
            {data.map((d) => (
              <tr key={d.date} className="border-t border-rule">
                <td className="py-1">{dayLabel(locale, d.date)}</td>
                {kind === "orders" ? (
                  <>
                    <td className="py-1 text-end">{d.shop}</td>
                    <td className="py-1 text-end">{d.quick}</td>
                  </>
                ) : (
                  <td className="py-1 text-end">{money(locale, d.revenue)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
