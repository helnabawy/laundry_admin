import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { TicketView } from "@/server/queries/orders";
import { StatusStamp } from "@/components/ui/status-stamp";
import { KindGlyph } from "./kind-glyph";
import { dateTime, money, pick } from "@/lib/format";

export async function OrdersTable({ rows, showVendor }: { rows: TicketView[]; showVendor?: boolean }) {
  const t = await getTranslations("orders");
  const locale = await getLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-rule text-start text-[12.5px] text-ink-3">
            <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("number")}</th>
            <th scope="col" className="px-3 py-3 text-start font-medium">{t("status")}</th>
            <th scope="col" className="px-3 py-3 text-start font-medium">{t("customer")}</th>
            <th scope="col" className="px-3 py-3 text-start font-medium">{t("kind")}</th>
            {showVendor ? <th scope="col" className="px-3 py-3 text-start font-medium">{t("laundry")}</th> : null}
            <th scope="col" className="px-3 py-3 text-start font-medium">{t("pickup")}</th>
            <th scope="col" className="px-4 py-3 text-end font-medium sm:px-5">{t("total")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="group border-b border-rule last:border-0 hover:bg-card-recessed">
              <td className="px-4 py-3 sm:px-5">
                <Link
                  href={`/orders/${o.id}`}
                  className="numerals text-[15px] font-semibold underline decoration-transparent underline-offset-4 group-hover:decoration-ink"
                >
                  {o.number}
                </Link>
              </td>
              <td className="px-3 py-3">
                <StatusStamp status={o.status} size="sm" />
              </td>
              <td className="max-w-56 px-3 py-3">
                <span className="block truncate font-medium">{o.customerName || t("noName")}</span>
                <span className="block text-[12.5px] text-ink-3" dir="ltr">
                  {o.customerPhone}
                </span>
              </td>
              <td className="px-3 py-3 text-ink-2">
                <KindGlyph kind={o.kind} withLabel />
              </td>
              {showVendor ? (
                <td className="px-3 py-3 text-ink-2">{pick(locale, o.vendorName.en, o.vendorName.ar)}</td>
              ) : null}
              <td className="numerals px-3 py-3 text-[12.5px] text-ink-2">{dateTime(locale, o.pickupStart, "dayTime")}</td>
              <td className="numerals px-4 py-3 text-end font-medium sm:px-5">
                {o.total !== null ? money(locale, o.total) : <span className="font-sans text-ink-3">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
