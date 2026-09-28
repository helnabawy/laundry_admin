import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { invoiceTotals } from "@/domain/pricing";
import { resolveSlot } from "@/server/slots";
import { address as serializeAddress } from "@/server/api/serializers";
import { DomainError, recordStatus, type OrderRow } from "./transition";

export const newOrderSchema = z.object({
  lines: z
    .array(z.object({ categoryId: z.string(), subServiceId: z.string() }))
    .default([]),
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().int() }))
    .default([]),
  tierId: z.string(),
  paymentMethod: z.enum(["card", "cashOnDelivery"]).nullish(),
  pickupSlotId: z.string(),
  deliverySlotId: z.string(),
  addressId: z.string(),
});

export type NewOrder = z.infer<typeof newOrderSchema>;

/**
 * Books an order for `customerId` at `vendorId`.
 *
 * Shop flow (`items`): priced here from the live catalogue and invoiced
 * immediately — the client's total is never trusted.
 * Wizard flow (`lines`): no price until the laundry counts the items.
 *
 * The order starts `pending`; the laundry assigns the pickup driver from the
 * portal.
 */
export async function createOrder(input: {
  vendorId: string;
  customerId: string;
  params: NewOrder;
}): Promise<string> {
  const { vendorId, customerId, params } = input;
  const isShop = params.items.length > 0;
  if (!isShop && params.lines.length === 0) {
    throw new DomainError("Order must have at least one line or item");
  }
  if (isShop && !params.paymentMethod) {
    throw new DomainError("Payment method is required");
  }

  const [customer, address, tier, vendor] = await Promise.all([
    db.mobileUser.findUniqueOrThrow({ where: { id: customerId } }),
    db.address.findFirst({
      where: { id: params.addressId, userId: customerId, deletedAt: null },
    }),
    db.serviceTier.findFirst({
      where: { id: params.tierId, vendorId, isActive: true },
    }),
    db.vendor.findUniqueOrThrow({ where: { id: vendorId } }),
  ]);
  if (!address) throw new DomainError("Address not found", 404);
  if (!tier) throw new DomainError("Service level not found", 404);

  const [pickup, delivery] = await Promise.all([
    resolveSlot(vendorId, params.pickupSlotId, "pickup"),
    resolveSlot(vendorId, params.deliverySlotId, "delivery"),
  ]);
  if (!pickup || !delivery) throw new DomainError("Time slot not found", 404);
  if (pickup.isFull) throw new DomainError("The pickup slot is full");
  if (delivery.isFull) throw new DomainError("The delivery slot is full");
  if (pickup.start <= new Date()) {
    throw new DomainError("The pickup slot has already started");
  }
  const earliestDelivery = new Date(
    pickup.start.getTime() + tier.deliveryHours * 3_600_000,
  );
  if (delivery.start < earliestDelivery) {
    throw new DomainError("The delivery slot is too early for this service level");
  }

  // Validate catalogue references before opening the transaction.
  let shopItems: {
    productId: string;
    categoryId: string;
    nameEn: string;
    nameAr: string;
    quantity: number;
    unitPrice: number;
  }[] = [];
  if (isShop) {
    const ids = [...new Set(params.items.map((i) => i.productId))];
    const products = await db.product.findMany({
      where: { id: { in: ids }, vendorId, isActive: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    shopItems = params.items.map((item) => {
      if (item.quantity < 1) throw new DomainError("Quantity must be at least 1");
      const p = byId.get(item.productId);
      if (!p) throw new DomainError("Product not found", 404);
      return {
        productId: p.id,
        categoryId: p.categoryId,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        quantity: item.quantity,
        unitPrice: Number(p.unitPrice),
      };
    });
  } else {
    const subs = await db.subService.findMany({
      where: {
        id: { in: params.lines.map((l) => l.subServiceId) },
        isActive: true,
        category: { vendorId, isActive: true },
      },
    });
    const byId = new Map(subs.map((s) => [s.id, s]));
    for (const line of params.lines) {
      const sub = byId.get(line.subServiceId);
      if (!sub || sub.categoryId !== line.categoryId) {
        throw new DomainError("Service not found", 404);
      }
    }
  }

  return db.$transaction(async (tx) => {
    const { orderSeq: number } = await tx.vendor.update({
      where: { id: vendorId },
      data: { orderSeq: { increment: 1 } },
      select: { orderSeq: true },
    });

    const order = await tx.order.create({
      data: {
        vendorId,
        number,
        kind: isShop ? "SHOP" : "WIZARD",
        status: "pending",
        customerId,
        customerName: customer.fullName ?? "",
        customerPhone: customer.phone,
        addressSnapshot: serializeAddress(address),
        tierId: tier.id,
        pickupSlotId: pickup.id,
        pickupStart: pickup.start,
        pickupEnd: pickup.end,
        deliverySlotId: delivery.id,
        deliveryStart: delivery.start,
        deliveryEnd: delivery.end,
        lines: isShop
          ? undefined
          : {
              create: params.lines.map((l) => ({
                categoryId: l.categoryId,
                subServiceId: l.subServiceId,
              })),
            },
      },
    });

    if (isShop) {
      const totals = invoiceTotals({
        lines: shopItems,
        tier: {
          surchargeType: tier.surchargeType,
          surchargeValue: Number(tier.surchargeValue),
        },
        paymentMethod: params.paymentMethod,
        vendorCodFee: Number(vendor.codFee),
      });
      const paid = params.paymentMethod === "card";
      await tx.invoice.create({
        data: {
          orderId: order.id,
          number: `${vendor.invoicePrefix}-${number}`,
          paymentMethod: params.paymentMethod,
          // Card is simulated as an instant successful charge (no gateway
          // yet); cash is collected by the driver on delivery.
          paid,
          paidAt: paid ? new Date() : null,
          vipSurcharge: totals.vipSurcharge,
          codFee: totals.codFee,
          items: {
            create: shopItems.map((i, index) => ({ ...i, sortOrder: index })),
          },
        },
      });
    }

    const row: OrderRow = {
      id: order.id,
      vendorId,
      number,
      kind: order.kind,
      status: "pending",
      customerId,
      pickupDriverId: null,
      deliveryDriverId: null,
    };
    await recordStatus(tx, row, "pending", undefined, {
      type: "customer",
      id: customerId,
    });
    return order.id;
  });
}
