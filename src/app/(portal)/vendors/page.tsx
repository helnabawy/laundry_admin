import { getLocale, getTranslations } from "next-intl/server";
import { requirePage } from "@/server/auth/session";
import { db } from "@/server/db";
import { num, pick } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { VendorForm } from "@/components/people/vendor-form";

export async function generateMetadata() {
  const t = await getTranslations("vendors");
  return { title: t("title") };
}

export default async function VendorsPage() {
  await requirePage("vendors.manage");
  const t = await getTranslations("vendors");
  const locale = await getLocale();
  const vendors = await db.vendor.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { orders: true, staff: true, drivers: true } } },
  });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {vendors.length === 1 ? <p className="mb-4 max-w-[65ch] text-sm text-ink-3">{t("singleNote")}</p> : null}
      <div className="flex max-w-4xl flex-col gap-5">
        {vendors.map((v) => (
          <Sheet key={v.id}>
            <SheetHeader
              title={pick(locale, v.nameEn, v.nameAr)}
              actions={
                <span className="numerals text-[12.5px] text-ink-2">
                  <span className="font-sans">{t("orders")}</span> {num(locale, v._count.orders)} · <span className="font-sans">{t("staff")}</span> {v._count.staff} ·{" "}
                  <span className="font-sans">{t("drivers")}</span> {v._count.drivers}
                </span>
              }
            />
            <VendorForm
              vendor={{
                id: v.id,
                nameEn: v.nameEn,
                nameAr: v.nameAr,
                phone: v.phone,
                codFee: Number(v.codFee),
                invoicePrefix: v.invoicePrefix,
                isActive: v.isActive,
              }}
            />
          </Sheet>
        ))}
      </div>
    </>
  );
}
