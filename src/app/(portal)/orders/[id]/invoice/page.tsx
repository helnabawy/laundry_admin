import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePage } from "@/server/auth/session";
import { orderDetail } from "@/server/queries/orders";
import { db } from "@/server/db";
import { InvoiceForm } from "@/components/orders/invoice-form";

export async function generateMetadata() {
  const t = await getTranslations("invoiceForm");
  return { title: t("title") };
}

export default async function InvoicePage({ params }: PageProps<"/orders/[id]/invoice">) {
  const session = await requirePage("orders.operate");
  const { id } = await params;
  const order = await orderDetail(session, id);
  if (!order) notFound();
  if (order.kind !== "WIZARD" || order.status !== "atFacility" || order.invoice) redirect(`/orders/${id}`);

  const categories = await db.serviceCategory.findMany({
    where: { vendorId: order.vendorId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      products: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, nameEn: true, nameAr: true, unitPrice: true },
      },
    },
  });

  return (
    <InvoiceForm
      order={{
        id: order.id,
        number: order.number,
        customerName: order.customerName,
        requested: order.lines.map((l) => ({
          category: { en: l.category.nameEn, ar: l.category.nameAr },
          subService: { en: l.subService.nameEn, ar: l.subService.nameAr },
        })),
        requestedCategoryIds: order.lines.map((l) => l.categoryId),
      }}
      tier={{
        nameEn: order.tier.nameEn,
        nameAr: order.tier.nameAr,
        isVip: order.tier.isVip,
        surchargeType: order.tier.surchargeType,
        surchargeValue: Number(order.tier.surchargeValue),
      }}
      codFee={Number(order.vendor.codFee)}
      categories={categories
        .filter((c) => c.products.length > 0)
        .map((c) => ({
          id: c.id,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          products: c.products.map((p) => ({ id: p.id, nameEn: p.nameEn, nameAr: p.nameAr, unitPrice: Number(p.unitPrice) })),
        }))}
    />
  );
}
