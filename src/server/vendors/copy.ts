import "server-only";
import type { Tx } from "@/server/orders/transition";

/** A row without its identity and timestamps, ready to insert as a new row. */
function strip<T extends { id: string; createdAt: Date; updatedAt: Date }>(row: T): Omit<T, "id" | "createdAt" | "updatedAt"> {
  const rest: Partial<T> = { ...row };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest as Omit<T, "id" | "createdAt" | "updatedAt">;
}

/**
 * Gives a new laundry a working starting point: a copy of another laundry's
 * categories (with sub-services), products, service tiers and time windows.
 * Every row gets a new id, so later edits never leak between laundries.
 */
export async function copyCatalogue(tx: Tx, fromVendorId: string, toVendorId: string) {
  const categories = await tx.serviceCategory.findMany({
    where: { vendorId: fromVendorId },
    include: { subServices: true, products: true },
  });
  for (const { subServices, products, ...c } of categories) {
    const created = await tx.serviceCategory.create({ data: { ...strip(c), vendorId: toVendorId } });
    if (subServices.length) {
      await tx.subService.createMany({
        data: subServices.map((s) => ({ ...strip(s), categoryId: created.id })),
      });
    }
    if (products.length) {
      await tx.product.createMany({
        data: products.map((p) => ({ ...strip(p), vendorId: toVendorId, categoryId: created.id })),
      });
    }
  }
  const tiers = await tx.serviceTier.findMany({ where: { vendorId: fromVendorId } });
  if (tiers.length) {
    await tx.serviceTier.createMany({
      data: tiers.map((t) => ({ ...strip(t), vendorId: toVendorId, perks: t.perks ?? [] })),
    });
  }
  const windows = await tx.slotWindow.findMany({ where: { vendorId: fromVendorId } });
  if (windows.length) {
    await tx.slotWindow.createMany({
      data: windows.map((w) => ({ ...strip(w), vendorId: toVendorId })),
    });
  }
}
