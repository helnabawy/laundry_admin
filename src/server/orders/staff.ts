import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { invoiceTotals, round2 } from "@/domain/pricing";
import {
  audit,
  DomainError,
  transitionOrder,
  type ActorRef,
  type Tx,
} from "./transition";

/**
 * The laundry's side of the order lifecycle — what the Admin Portal drives.
 * Each function is one guarded transition (see src/domain/order-workflow.ts).
 */

interface StaffActor {
  userId: string;
  /** null = super admin (any vendor). */
  vendorId: string | null;
}

const actorRef = (s: StaffActor): ActorRef => ({ type: "staff", id: s.userId });

function vendorGuard(staff: StaffActor) {
  return (order: { vendorId: string }) => {
    if (staff.vendorId && order.vendorId !== staff.vendorId) {
      throw new DomainError("Order not found", 404);
    }
  };
}

async function requireDriver(tx: Tx, vendorId: string, driverId: string) {
  const driver = await tx.mobileUser.findFirst({
    where: { id: driverId, vendorId, role: "driver", isActive: true },
  });
  if (!driver) throw new DomainError("Driver not found", 404);
  return driver;
}

export async function assignPickupDriver(
  staff: StaffActor,
  orderId: string,
  driverId: string,
) {
  const current = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const transition =
    current?.status === "driverAssigned" ? "reassignPickupDriver" : "assignPickupDriver";
  const order = await transitionOrder({
    orderId,
    transition,
    actor: actorRef(staff),
    guard: vendorGuard(staff),
    apply: async (tx, o) => {
      await requireDriver(tx, o.vendorId, driverId);
      return { pickupDriverId: driverId };
    },
  });
  await audit(db, {
    actorId: staff.userId,
    vendorId: order.vendorId,
    action: `order.${transition}`,
    entity: "Order",
    entityId: orderId,
    data: { driverId },
  });
  return order;
}

/** The driver handed the items over at the laundry. */
export async function receiveFromDriver(staff: StaffActor, orderId: string) {
  const order = await transitionOrder({
    orderId,
    transition: "receiveFromDriver",
    actor: actorRef(staff),
    guard: vendorGuard(staff),
  });
  await audit(db, {
    actorId: staff.userId,
    vendorId: order.vendorId,
    action: "order.receiveFromDriver",
    entity: "Order",
    entityId: orderId,
  });
  return order;
}

export const invoiceInputSchema = z
  .object({
    items: z
      .array(
        z.union([
          z.object({
            productId: z.string().min(1),
            quantity: z.number().int().min(1).max(999),
          }),
          z.object({
            nameEn: z.string().trim().min(1).max(120),
            nameAr: z.string().trim().min(1).max(120),
            quantity: z.number().int().min(1).max(999),
            unitPrice: z.number().min(0).max(100_000),
          }),
        ]),
      )
      .min(1, "Add at least one item"),
    conditions: z
      .array(
        z.object({
          itemName: z.string().trim().min(1).max(120),
          kind: z.enum(["stain", "damage"]),
          note: z.string().trim().max(500).optional(),
          photoUrl: z.string().max(500).optional(),
        }),
      )
      .default([]),
    /** Staff must explicitly confirm "no stains or damage" when none are listed. */
    noFindingsConfirmed: z.boolean().default(false),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.conditions.length > 0 || v.noFindingsConfirmed, {
    message: "Record the condition report: add findings or confirm there are none",
    path: ["conditions"],
  });

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

/**
 * Wizard path: the laundry counted and priced the items and sorted them for
 * stains/damage. Issues the invoice and asks the customer to pay.
 */
export async function issueInvoice(
  staff: StaffActor,
  orderId: string,
  raw: InvoiceInput,
) {
  const input = invoiceInputSchema.parse(raw);
  const order = await transitionOrder({
    orderId,
    transition: "issueInvoice",
    actor: actorRef(staff),
    guard: vendorGuard(staff),
    apply: async (tx, o) => {
      const [vendor, full] = await Promise.all([
        tx.vendor.findUniqueOrThrow({ where: { id: o.vendorId } }),
        tx.order.findUniqueOrThrow({
          where: { id: o.id },
          include: { tier: true, invoice: true },
        }),
      ]);
      if (full.invoice) throw new DomainError("This order already has an invoice");

      const productIds = input.items.flatMap((i) => ("productId" in i ? [i.productId] : []));
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, vendorId: o.vendorId },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const items = input.items.map((item, index) => {
        if ("productId" in item) {
          const p = byId.get(item.productId);
          if (!p) throw new DomainError("Product not found", 404);
          return {
            productId: p.id,
            categoryId: p.categoryId,
            nameEn: p.nameEn,
            nameAr: p.nameAr,
            quantity: item.quantity,
            unitPrice: Number(p.unitPrice),
            sortOrder: index,
          };
        }
        return {
          productId: null,
          categoryId: null,
          nameEn: item.nameEn,
          nameAr: item.nameAr,
          quantity: item.quantity,
          unitPrice: round2(item.unitPrice),
          sortOrder: index,
        };
      });

      const totals = invoiceTotals({
        lines: items,
        tier: {
          surchargeType: full.tier.surchargeType,
          surchargeValue: Number(full.tier.surchargeValue),
        },
        paymentMethod: null,
        vendorCodFee: Number(vendor.codFee),
      });

      await tx.invoice.create({
        data: {
          orderId: o.id,
          number: `${vendor.invoicePrefix}-${o.number}`,
          vipSurcharge: totals.vipSurcharge,
          codFee: 0,
          note: input.note || null,
          issuedById: staff.userId,
          items: { create: items },
          conditions: {
            create: input.conditions.map((c) => ({
              itemName: c.itemName,
              kind: c.kind,
              note: c.note || null,
              photoUrl: c.photoUrl || null,
            })),
          },
        },
      });
    },
  });
  await audit(db, {
    actorId: staff.userId,
    vendorId: order.vendorId,
    action: "order.issueInvoice",
    entity: "Order",
    entityId: orderId,
    data: { items: input.items.length, conditions: input.conditions.length },
  });
  return order;
}

/** Cleaning finished; the order leaves with the delivery driver. */
export async function markCleaned(
  staff: StaffActor,
  orderId: string,
  deliveryDriverId: string,
) {
  return dispatchDelivery(staff, orderId, deliveryDriverId, "markCleaned");
}

/** A failed delivery goes out again, possibly with another driver. */
export async function retryDelivery(
  staff: StaffActor,
  orderId: string,
  deliveryDriverId: string,
) {
  return dispatchDelivery(staff, orderId, deliveryDriverId, "retryDelivery");
}

async function dispatchDelivery(
  staff: StaffActor,
  orderId: string,
  deliveryDriverId: string,
  transition: "markCleaned" | "retryDelivery",
) {
  const order = await transitionOrder({
    orderId,
    transition,
    actor: actorRef(staff),
    guard: vendorGuard(staff),
    apply: async (tx, o) => {
      await requireDriver(tx, o.vendorId, deliveryDriverId);
      return { deliveryDriverId };
    },
  });
  await audit(db, {
    actorId: staff.userId,
    vendorId: order.vendorId,
    action: `order.${transition}`,
    entity: "Order",
    entityId: orderId,
    data: { deliveryDriverId },
  });
  return order;
}

export async function cancelOrder(
  staff: StaffActor,
  orderId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (!trimmed) throw new DomainError("A reason is required to cancel");
  const order = await transitionOrder({
    orderId,
    transition: "cancel",
    actor: actorRef(staff),
    guard: vendorGuard(staff),
    note: trimmed,
    data: { cancelReason: trimmed },
  });
  await audit(db, {
    actorId: staff.userId,
    vendorId: order.vendorId,
    action: "order.cancel",
    entity: "Order",
    entityId: orderId,
    data: { reason: trimmed },
  });
  return order;
}
