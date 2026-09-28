import "server-only";
import { db } from "@/server/db";
import { DomainError, transitionOrder, type OrderRow } from "./transition";

/**
 * Customer and driver actions from the mobile app. Ownership is checked
 * against the locked row; the workflow module checks the status.
 */

type FailureReason = "customerAbsent" | "wrongAddress" | "customerRescheduled" | "other";

function ownedByCustomer(customerId: string) {
  return (o: OrderRow) => {
    if (o.customerId !== customerId) throw new DomainError("Order not found", 404);
  };
}

function pickupTaskOf(driverId: string) {
  return (o: OrderRow) => {
    if (o.pickupDriverId !== driverId) throw new DomainError("Task not found", 404);
  };
}

function deliveryTaskOf(driverId: string) {
  return (o: OrderRow) => {
    if (o.deliveryDriverId !== driverId) throw new DomainError("Task not found", 404);
  };
}

// ---- Customer ---------------------------------------------------------------

export async function choosePaymentMethod(
  customerId: string,
  orderId: string,
  method: "card" | "cashOnDelivery",
  conditionsAcknowledged: boolean,
) {
  return transitionOrder({
    orderId,
    transition: "choosePaymentMethod",
    actor: { type: "customer", id: customerId },
    guard: ownedByCustomer(customerId),
    apply: async (tx, o) => {
      const [invoice, vendor] = await Promise.all([
        tx.invoice.findUnique({
          where: { orderId: o.id },
          include: { _count: { select: { conditions: true } } },
        }),
        tx.vendor.findUniqueOrThrow({ where: { id: o.vendorId } }),
      ]);
      if (!invoice) throw new DomainError("The invoice isn't ready yet");
      if (invoice._count.conditions > 0 && !conditionsAcknowledged) {
        throw new DomainError("Condition report must be acknowledged first");
      }
      const paid = method === "card";
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paymentMethod: method,
          conditionsAcknowledged: conditionsAcknowledged || invoice._count.conditions === 0,
          // Cash on delivery carries the vendor's flat handling fee.
          codFee: method === "cashOnDelivery" ? vendor.codFee : 0,
          // Card is simulated as an instant successful charge (no gateway yet).
          paid,
          paidAt: paid ? new Date() : null,
        },
      });
    },
  });
}

export async function rateOrder(
  customerId: string,
  orderId: string,
  stars: number,
  comment?: string | null,
) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new DomainError("Stars must be 1–5");
  }
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { rating: true },
    });
    if (!order || order.customerId !== customerId) {
      throw new DomainError("Order not found", 404);
    }
    if (order.status !== "delivered") {
      throw new DomainError("Only a delivered order can be rated");
    }
    if (order.rating) throw new DomainError("Order already rated");
    await tx.orderRating.create({
      data: { orderId, stars, comment: comment?.trim() || null },
    });
    await tx.notification.create({
      data: {
        audience: "staff",
        vendorId: order.vendorId,
        kind: "orderRated",
        orderId,
        orderNumber: order.number,
      },
    });
  });
}

// ---- Driver -----------------------------------------------------------------

export async function confirmPickup(driverId: string, orderId: string) {
  return transitionOrder({
    orderId,
    transition: "confirmPickup",
    actor: { type: "driver", id: driverId },
    guard: pickupTaskOf(driverId),
  });
}

export async function reportPickupFailed(
  driverId: string,
  orderId: string,
  input: { reason: FailureReason; note?: string | null; photoUrl: string },
) {
  return transitionOrder({
    orderId,
    transition: "reportPickupFailed",
    actor: { type: "driver", id: driverId },
    guard: pickupTaskOf(driverId),
    note: input.note ?? undefined,
    apply: async (tx, o) => {
      await tx.taskFailure.create({
        data: {
          orderId: o.id,
          stage: "pickup",
          reason: input.reason,
          note: input.note || null,
          photoUrl: input.photoUrl,
          driverId,
        },
      });
    },
  });
}

export async function confirmDelivery(
  driverId: string,
  orderId: string,
  input: { cashCollected: boolean; photoUrl?: string | null },
) {
  return transitionOrder({
    orderId,
    transition: "confirmDelivery",
    actor: { type: "driver", id: driverId },
    guard: deliveryTaskOf(driverId),
    apply: async (tx, o) => {
      const invoice = await tx.invoice.findUnique({ where: { orderId: o.id } });
      if (invoice && invoice.paymentMethod === "cashOnDelivery" && !invoice.paid) {
        if (!input.cashCollected) {
          throw new DomainError("Cash must be collected before confirming delivery");
        }
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paid: true, paidAt: new Date() },
        });
      }
      if (input.photoUrl) {
        await tx.proofOfDelivery.upsert({
          where: { orderId: o.id },
          create: { orderId: o.id, photoUrl: input.photoUrl },
          update: { photoUrl: input.photoUrl },
        });
      }
    },
  });
}

export async function reportDeliveryFailed(
  driverId: string,
  orderId: string,
  input: { reason: FailureReason; note?: string | null },
) {
  return transitionOrder({
    orderId,
    transition: "reportDeliveryFailed",
    actor: { type: "driver", id: driverId },
    guard: deliveryTaskOf(driverId),
    note: input.note ?? undefined,
    apply: async (tx, o) => {
      await tx.taskFailure.create({
        data: {
          orderId: o.id,
          stage: "delivery",
          reason: input.reason,
          note: input.note || null,
          driverId,
        },
      });
    },
  });
}
