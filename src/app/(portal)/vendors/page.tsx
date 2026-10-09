import { getLocale, getTranslations } from "next-intl/server";
import { MapPin, Store } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { db } from "@/server/db";
import { money, num, pick } from "@/lib/format";
import { mapsUrl } from "@/domain/geo";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { EditVendorDialog, NewVendorDialog } from "@/components/people/vendor-form";
import { cn } from "@/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("vendors");
  return { title: t("title") };
}

export default async function VendorsPage() {
  await requirePage("vendors.manage");
  const t = await getTranslations();
  const locale = await getLocale();
  const vendors = await db.vendor.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { orders: true, staff: true } } },
  });
  return (
    <>
      <PageHeader
        title={t("vendors.title")}
        description={t("vendors.description")}
        actions={<NewVendorDialog vendors={vendors.map((v) => ({ id: v.id, nameEn: v.nameEn, nameAr: v.nameAr }))} />}
      />
      {vendors.length === 1 ? <p className="mb-4 max-w-[65ch] text-sm text-ink-3">{t("vendors.singleNote")}</p> : null}
      <Sheet>
        {vendors.length === 0 ? (
          <EmptyState icon={Store} title={t("vendors.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th scope="col" className="px-4 py-3 text-start font-medium sm:px-5">{t("vendors.laundry")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("vendors.where")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("vendors.phone")}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t("vendors.prefixShort")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("vendors.codFeeShort")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("vendors.orders")}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t("vendors.staff")}</th>
                  <th scope="col" className="px-4 py-3 sm:px-5"><span className="sr-only">{t("vendors.edit")}</span></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const name = pick(locale, v.nameEn, v.nameAr);
                  const address = v.addressEn || v.addressAr ? pick(locale, v.addressEn ?? "", v.addressAr ?? "") : null;
                  const place = [v.area, v.city].filter(Boolean).join(locale === "ar" ? "، " : ", ");
                  const pin = v.latitude != null && v.longitude != null ? { latitude: v.latitude, longitude: v.longitude } : null;
                  return (
                    <tr key={v.id} className={cn("border-b border-rule align-top last:border-0", !v.isActive && "text-ink-3")}>
                      <th scope="row" className="px-4 py-3 text-start font-normal sm:px-5">
                        <span className="block font-medium">{name}</span>
                        <span className="block text-[12.5px] text-ink-3" dir="ltr">{v.slug}</span>
                        {!v.isActive ? (
                          <span className="mt-1 inline-block rounded-[4px] bg-grey-wash px-1.5 text-[12px] text-grey-ink">{t("vendors.paused")}</span>
                        ) : null}
                      </th>
                      <td className="max-w-[18rem] px-3 py-3">
                        {address || place ? (
                          <>
                            {address ? <span className="block text-ink-2">{address}</span> : null}
                            {place ? <span className="block text-[12.5px] text-ink-3">{place}</span> : null}
                          </>
                        ) : (
                          <span className="block text-ink-3">{t("vendors.noAddress")}</span>
                        )}
                        {pin ? (
                          <a
                            href={mapsUrl(pin)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                          >
                            <MapPin className="size-3.5" aria-hidden />
                            {t("orders.openMap")}
                          </a>
                        ) : (
                          <span className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-3">
                            <MapPin className="size-3.5" aria-hidden />
                            {t("vendors.noPin")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink-2">
                        {v.phone ? (
                          <a href={`tel:${v.phone}`} dir="ltr" className="hover:text-ink">{v.phone}</a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="numerals px-3 py-3">{v.invoicePrefix}</td>
                      <td className="numerals px-3 py-3 text-end">{money(locale, Number(v.codFee))}</td>
                      <td className="numerals px-3 py-3 text-end">{num(locale, v._count.orders)}</td>
                      <td className="numerals px-3 py-3 text-end">{num(locale, v._count.staff)}</td>
                      <td className="px-4 py-2 text-end sm:px-5">
                        <EditVendorDialog
                          name={name}
                          vendor={{
                            id: v.id,
                            nameEn: v.nameEn,
                            nameAr: v.nameAr,
                            phone: v.phone,
                            addressEn: v.addressEn,
                            addressAr: v.addressAr,
                            city: v.city,
                            area: v.area,
                            latitude: v.latitude,
                            longitude: v.longitude,
                            codFee: Number(v.codFee),
                            invoicePrefix: v.invoicePrefix,
                            isActive: v.isActive,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
