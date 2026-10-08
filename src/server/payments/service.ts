import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { TransitionError } from "@/domain/order-workflow";
import {
  CHECKOUT_TTL_MS,
  gatewayFee,
  isExpired,
  isOnline,
  providerFor,
  refundProblem,
  statusAfterRefund,
  withinLimits,
  type PaymentProvider,
  type PaymentStatus,
} from "@/domain/payments";
import { round2, type PaymentMethod } from "@/domain/pricing";
import { CHANNEL, type PortalEvent } from "@/server/realtime/bus";
import { queuePush, withPushOutbox } from "@/server/push";
import {
  audit,
  DomainError,
  lockOrder,
  transitionOrder,
  type OrderRow,
  type Tx,
} from "@/server/orders/transition";
import { gatewayFor, type GatewayEvent, type OnlineProvider } from "./gateway";

/**
 * The payment ledger. Every write to `Payment` / `Refund` goes through here:
 * starting a hosted checkout, applying a gateway's verdict, recording cash
 * the driver collected, and refunds issued from the portal.
 *
 * `Invoice.paid` / `paidAt` stay in sync so older readers keep working.
 */

type OnlineMethod = Extract<PaymentMethod, "card" | "payLater">;

const invoiceWithItems = {
  items: { select: { quantity: true, unitPrice: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithItems = Prisma.InvoiceGetPayload<{ include: typeof invoiceWithItems }>;

/** What the customer owes on an invoice: items + VIP surcharge + COD fee. */
export function amountDue(invoice: InvoiceWithItems): number {
  const items = invoice.items.reduce(
    (sum, i) => sum + round2(i.quantity * Number(i.unitPrice)),
    0,
  );
  return round2(items + Number(invoice.vipSurcharge) + Number(invoice.codFee));
}

async function lockPayment(tx: Tx, paymentId: string) {
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

async function feeSchedule(tx: Tx, vendorId: string, provider: PaymentProvider) {
  const row = await tx.vendorGateway.findUnique({
    where: { vendorId_provider: { vendorId, provider } },
  });
  return {
    feePercent: Number(row?.feePercent ?? 0),
    feeFixed: Number(row?.feeFixed ?? 0),
  };
}

async function publish(tx: Tx, event: PortalEvent) {
  await tx.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
}

/**
 * Payment news that doesn't change the order's status: a notification for the
 * customer and/or the laundry, plus a realtime ping to the portal.
 */
async function notifyPayment(
  tx: Tx,
  order: Pick<OrderRow, "id" | "number" | "vendorId" | "customerId" | "status">,
  kinds: { customer?: string; staff?: string },
) {
  const base = { orderId: order.id, orderNumber: order.number, vendorId: order.vendorId };
  if (kinds.customer) {
    await tx.notification.create({
      data: { ...base, audience: "mobile", mobileUserId: order.customerId, kind: kinds.customer },
    });
    queuePush(tx, { ...base, mobileUserId: order.customerId, kind: kinds.customer, status: order.status });
  }
  if (kinds.staff) {
    const n = await tx.notification.create({
      data: { ...base, audience: "staff", kind: kinds.staff },
    });
    await publish(tx, {
      type: "notification",
      vendorId: order.vendorId,
      notificationId: n.id,
      kind: kinds.staff,
      orderId: order.id,
      orderNumber: order.number,
      status: order.status,
    });
  } else {
    await publish(tx, {
      type: "order",
      vendorId: order.vendorId,
      orderId: order.id,
      orderNumber: order.number,
      status: order.status,
    });
  }
}

// ---- Online checkout ------------------------------------------------------------

/**
 * Throws unless the laundry takes `method` for an order of `amount` (provider
 * switched on, total within its limits). Returns the provider to use.
 */
export async function assertMethodAvailable(
  tx: Tx,
  vendor: { id: string; cardProvider: string },
  method: PaymentMethod,
  amount: number,
): Promise<PaymentProvider> {
  const provider = providerFor(method, { cardProvider: vendor.cardProvider as PaymentProvider });
  const settings = await tx.vendorGateway.findUnique({
    where: { vendorId_provider: { vendorId: vendor.id, provider } },
  });
  if (settings && !settings.isEnabled) {
    throw new DomainError("This payment method isn't available");
  }
  if (
    settings &&
    !withinLimits(amount, {
      minAmount: settings.minAmount == null ? null : Number(settings.minAmount),
      maxAmount: settings.maxAmount == null ? null : Number(settings.maxAmount),
    })
  ) {
    throw new DomainError("This payment method isn't available for this amount");
  }
  return provider;
}

/**
 * Opens a hosted checkout for the order's unpaid invoice. Any earlier pending
 * attempt is cancelled first, so only one checkout link works at a time.
 * The amount always comes from the invoice, never from the client.
 */
export async function startPayment(orderId: string, method: OnlineMethod) {
  const payment = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "cancelled" || order.status === "pickupFailed") {
      throw new DomainError("This order was cancelled");
    }
    const [invoice, vendor] = await Promise.all([
      tx.invoice.findUnique({ where: { orderId }, include: invoiceWithItems }),
      tx.vendor.findUniqueOrThrow({ where: { id: order.vendorId } }),
    ]);
    if (!invoice) throw new DomainError("The invoice isn't ready yet");
    if (invoice.paid) throw new DomainError("This order is already paid");

    const amount = amountDue(invoice);
    const provider = (await assertMethodAvailable(tx, vendor, method, amount)) as OnlineProvider;

    await tx.payment.updateMany({
      where: { invoiceId: invoice.id, status: "pending" },
      data: { status: "cancelled", failureReason: "Replaced by a new attempt" },
    });
    return tx.payment.create({
      data: {
        vendorId: vendor.id,
        orderId,
        invoiceId: invoice.id,
        provider,
        method,
        amount,
        checkoutToken: randomBytes(24).toString("base64url"),
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
      include: { order: { select: { number: true, customerName: true, customerPhone: true } } },
    });
  });

  // Talk to the provider outside the transaction: a slow gateway must not
  // hold the order row lock.
  const checkout = await gatewayFor(payment.provider as OnlineProvider).createCheckout({
    paymentId: payment.id,
    checkoutToken: payment.checkoutToken,
    amount: Number(payment.amount),
    currency: payment.currency,
    orderNumber: payment.order.number,
    customer: { name: payment.order.customerName, phone: payment.order.customerPhone },
  });
  return db.payment.update({
    where: { id: payment.id },
    data: { providerRef: checkout.providerRef, checkoutUrl: checkout.checkoutUrl },
  });
}

/**
 * The customer tries again after a declined / abandoned checkout, optionally
 * switching between card and pay-later (neither carries a fee, so the invoice
 * total doesn't change).
 */
export async function retryPayment(
  customerId: string,
  orderId: string,
  method?: OnlineMethod,
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { invoice: true },
  });
  if (!order || order.customerId !== customerId) throw new DomainError("Order not found", 404);
  const invoice = order.invoice;
  if (!invoice) throw new DomainError("The invoice isn't ready yet");
  if (invoice.paid) throw new DomainError("This order is already paid");
  const current = invoice.paymentMethod as PaymentMethod | null;
  if (!isOnline(current)) {
    throw new DomainError("Choose how to pay first");
  }
  const next = method ?? (current as OnlineMethod);
  if (next !== current) {
    await db.invoice.update({ where: { id: invoice.id }, data: { paymentMethod: next } });
  }
  return startPayment(orderId, next);
}

/** Marks a lapsed pending checkout as expired. Returns the fresh row. */
export async function expireIfStale<T extends { id: string; status: string; expiresAt: Date | null }>(
  payment: T,
): Promise<T> {
  if (!isExpired({ status: payment.status as PaymentStatus, expiresAt: payment.expiresAt }, new Date())) {
    return payment;
  }
  await db.payment.updateMany({
    where: { id: payment.id, status: "pending" },
    data: { status: "expired", failureReason: "Checkout expired" },
  });
  return { ...payment, status: "expired" };
}

// ---- Gateway verdicts -------------------------------------------------------------

export type EventOutcome = "applied" | "duplicate";

/**
 * Applies a verified gateway event. Idempotent: providers retry webhooks, and
 * a payment that already reached a final state is left alone.
 */
export async function handleGatewayEvent(event: GatewayEvent): Promise<EventOutcome> {
  const payment = await db.payment.findUnique({
    where: { provider_providerRef: { provider: event.provider, providerRef: event.providerRef } },
    include: { order: { select: { kind: true, status: true } } },
  });
  if (!payment) throw new DomainError("Payment not found", 404);
  // A late success on an expired checkout still means the money was taken.
  const open = payment.status === "pending" || (payment.status === "expired" && event.type === "succeeded");
  if (!open) return "duplicate";

  if (event.type !== "succeeded") {
    return withPushOutbox((attach) =>
      db.$transaction(async (tx) => {
        attach(tx);
        const order = await lockOrder(tx, payment.orderId);
        const locked = await lockPayment(tx, payment.id);
        if (locked.status !== "pending" && locked.status !== "expired") return "duplicate";
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: event.type === "failed" ? "failed" : "cancelled",
            failureReason: event.reason ?? (event.type === "failed" ? "Declined" : "Cancelled by customer"),
            events: appendEvent(locked.events, event),
          },
        });
        if (event.type === "failed") {
          await notifyPayment(tx, order, { customer: "paymentFailed", staff: "paymentFailed" });
        }
        return "applied" as const;
      }),
    );
  }

  // A wizard order waiting on this payment starts cleaning now.
  if (payment.order.kind === "WIZARD" && payment.order.status === "awaitingPayment") {
    try {
      await transitionOrder({
        orderId: payment.orderId,
        transition: "confirmOnlinePayment",
        actor: { type: "system", id: null },
        apply: async (tx) => {
          const locked = await lockPayment(tx, payment.id);
          if (locked.status !== "pending" && locked.status !== "expired") {
            throw new AlreadyHandled();
          }
          await markSucceeded(tx, locked, event);
        },
      });
      return "applied";
    } catch (error) {
      if (error instanceof AlreadyHandled) return "duplicate";
      // The order moved on concurrently (e.g. a duplicate webhook won the
      // race, or staff cancelled it): record the money without a transition.
      if (!(error instanceof TransitionError)) throw error;
    }
  }

  return withPushOutbox((attach) =>
    db.$transaction(async (tx) => {
      attach(tx);
      const order = await lockOrder(tx, payment.orderId);
      const locked = await lockPayment(tx, payment.id);
      if (locked.status !== "pending" && locked.status !== "expired") return "duplicate";
      await markSucceeded(tx, locked, event);
      await notifyPayment(tx, order, { customer: "paymentReceived", staff: "paymentReceived" });
      return "applied" as const;
    }),
  );
}

class AlreadyHandled extends Error {}

function appendEvent(events: Prisma.JsonValue, event: GatewayEvent): Prisma.InputJsonValue {
  const list = Array.isArray(events) ? events : [];
  return [
    ...list,
    { type: event.type, reason: event.reason ?? null, at: new Date().toISOString(), raw: event.raw },
  ] as Prisma.InputJsonValue;
}

async function markSucceeded(
  tx: Tx,
  payment: { id: string; vendorId: string; invoiceId: string; provider: string; method: string; amount: Prisma.Decimal; events: Prisma.JsonValue },
  event: GatewayEvent,
) {
  const paidAt = new Date();
  const fees = await feeSchedule(tx, payment.vendorId, payment.provider as PaymentProvider);
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "succeeded",
      paidAt,
      failureReason: null,
      feeAmount: gatewayFee(Number(payment.amount), fees),
      events: appendEvent(payment.events, event),
    },
  });
  await tx.invoice.update({
    where: { id: payment.invoiceId },
    data: {
      paid: true,
      paidAt,
      paymentMethod: payment.method as PaymentMethod,
    },
  });
}

// ---- Cash -------------------------------------------------------------------------

/**
 * The driver collected cash on delivery. Called inside the delivery
 * transition, so the ledger row commits with the status change.
 */
export async function recordCashCollection(
  tx: Tx,
  invoice: InvoiceWithItems,
  order: Pick<OrderRow, "id" | "vendorId">,
  driverId: string,
) {
  const paidAt = new Date();
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paid: true, paidAt },
  });
  await tx.payment.create({
    data: {
      vendorId: order.vendorId,
      orderId: order.id,
      invoiceId: invoice.id,
      provider: "cash",
      method: "cashOnDelivery",
      status: "succeeded",
      amount: amountDue(invoice),
      checkoutToken: randomBytes(24).toString("base64url"),
      collectedById: driverId,
      paidAt,
    },
  });
}

export { invoiceWithItems };

/**
 * A shop order paid online can't be dispatched before the money is in —
 * otherwise a declined card would still get a driver at the door.
 */
export async function assertDispatchable(tx: Tx, order: Pick<OrderRow, "id" | "kind">) {
  if (order.kind !== "SHOP") return;
  const invoice = await tx.invoice.findUnique({
    where: { orderId: order.id },
    select: { paymentMethod: true, paid: true },
  });
  if (invoice && isOnline(invoice.paymentMethod as PaymentMethod) && !invoice.paid) {
    throw new DomainError("Awaiting online payment");
  }
}

// ---- Refunds ------------------------------------------------------------------------

export interface StaffActor {
  userId: string;
  vendorId: string | null;
}

/** Full or partial refund of a completed payment, issued from the portal. */
export async function refundPayment(
  staff: StaffActor,
  paymentId: string,
  amount: number,
  reason: string,
) {
  const found = await db.payment.findUnique({ where: { id: paymentId } });
  if (!found || (staff.vendorId && found.vendorId !== staff.vendorId)) {
    throw new DomainError("Payment not found", 404);
  }

  const refund = await withPushOutbox((attach) =>
    db.$transaction(async (tx) => {
      attach(tx);
      const order = await lockOrder(tx, found.orderId);
      const payment = await lockPayment(tx, paymentId);
      const previous = await tx.refund.findMany({ where: { paymentId } });
      const prior = previous.map((r) => ({ amount: Number(r.amount) }));
      const problem = refundProblem(
        { amount: Number(payment.amount), status: payment.status as PaymentStatus },
        prior,
        amount,
      );
      if (problem) throw new DomainError(problem);

      // Cash goes back by hand; online providers reverse the charge. The mock
      // gateway answers instantly, so holding the lock here is fine — a real
      // provider call would move to an outbox.
      const providerRef =
        payment.provider === "cash"
          ? null
          : (await gatewayFor(payment.provider as OnlineProvider).refund({
              providerRef: payment.providerRef ?? "",
              amount,
            })).refundRef;

      const created = await tx.refund.create({
        data: {
          paymentId,
          vendorId: payment.vendorId,
          amount,
          reason,
          providerRef,
          createdById: staff.userId,
        },
      });
      const refunded = round2(prior.reduce((s, r) => s + r.amount, 0) + amount);
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: statusAfterRefund(Number(payment.amount), refunded) },
      });
      await notifyPayment(tx, order, { customer: "refundIssued", staff: "refundIssued" });
      return created;
    }),
  );

  await audit(db, {
    actorId: staff.userId,
    vendorId: found.vendorId,
    action: "payment.refund",
    entity: "Payment",
    entityId: paymentId,
    data: { amount, reason, refundId: refund.id, orderId: found.orderId },
  });
  return refund;
}
