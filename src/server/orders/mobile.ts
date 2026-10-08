import "server-only";
import { db } from "@/server/db";
import { canTransition, TransitionError } from "@/domain/order-workflow";
import type { PaymentMethod } from "@/domain/pricing";
import {
  assertMethodAvailable,
  invoiceWithItems,
  recordCashCollection,
  startPayment,
} from "@/server/payments/service";
import {
  DomainError,
  lockOrder,
  transitionOrder,
  type OrderRow,
  type Tx,
} from "./transition";

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

/**
 * The customer picks how to pay a wizard invoice.
 *
 * Cash on delivery settles the choice on the spot (cleaning starts, the
 * driver collects later). Card / pay-later open a hosted checkout and the
 * order stays `awaitingPayment` until the gateway confirms the charge (see
 * `handleGatewayEvent`). Returns the checkout to send the customer to.
 */
export async function choosePaymentMethod(
  customerId: string,
  orderId: string,
  method: PaymentMethod,
  conditionsAcknowledged: boolean,
) {
  if (method === "cashOnDelivery") {
    await transitionOrder({
      orderId,
      transition: "choosePaymentMethod",
      actor: { type: "customer", id: customerId },
      guard: ownedByCustomer(customerId),
      apply: async (tx, o) => {
        const [invoice, vendor] = await Promise.all([
          readyInvoice(tx, o.id, conditionsAcknowledged),
          tx.vendor.findUniqueOrThrow({ where: { id: o.vendorId } }),
        ]);
        await assertMethodAvailable(tx, vendor, "cashOnDelivery", 0);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paymentMethod: method,
            conditionsAcknowledged: true,
            // Cash on delivery carries the vendor's flat handling fee.
            codFee: vendor.codFee,
            paid: false,
            paidAt: null,
          },
        });
        // A card checkout the customer abandoned no longer applies.
        await tx.payment.updateMany({
          where: { invoiceId: invoice.id, status: "pending" },
          data: { status: "cancelled", failureReason: "Switched to cash on delivery" },
        });
      },
    });
    return null;
  }

  await db.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    ownedByCustomer(customerId)(o);
    if (!canTransition("confirmOnlinePayment", o)) {
      throw new TransitionError("choosePaymentMethod", o.status, o.kind);
    }
    const invoice = await readyInvoice(tx, o.id, conditionsAcknowledged);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paymentMethod: method, conditionsAcknowledged: true, codFee: 0 },
    });
  });
  return startPayment(orderId, method);
}

async function readyInvoice(tx: Tx, orderId: string, conditionsAcknowledged: boolean) {
  const invoice = await tx.invoice.findUnique({
    where: { orderId },
    include: { _count: { select: { conditions: true } } },
  });
  if (!invoice) throw new DomainError("The invoice isn't ready yet");
  if (invoice.paid) throw new DomainError("This order is already paid");
  if (invoice._count.conditions > 0 && !conditionsAcknowledged) {
    throw new DomainError("Condition report must be acknowledged first");
  }
  return invoice;
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
      const invoice = await tx.invoice.findUnique({
        where: { orderId: o.id },
        include: invoiceWithItems,
      });
      if (invoice && invoice.paymentMethod === "cashOnDelivery" && !invoice.paid) {
        if (!input.cashCollected) {
          throw new DomainError("Cash must be collected before confirming delivery");
        }
        await recordCashCollection(tx, invoice, o, driverId);
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
