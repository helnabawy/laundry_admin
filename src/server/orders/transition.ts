import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  resolveTransition,
  type Actor,
  type OrderKind,
  type OrderStatus,
  type TransitionId,
} from "@/domain/order-workflow";
import {
  customerKindFor,
  driverKindFor,
  staffKindFor,
} from "@/domain/notifications";
import { CHANNEL, type PortalEvent } from "@/server/realtime/bus";

export type Tx = Prisma.TransactionClient;

export interface ActorRef {
  type: Actor;
  id: string | null;
}

export class DomainError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface OrderRow {
  id: string;
  vendorId: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  customerId: string;
  pickupDriverId: string | null;
  deliveryDriverId: string | null;
}

/** Locks the order row for the rest of the transaction. */
export async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow> {
  const rows = await tx.$queryRaw<OrderRow[]>`
    SELECT id, "vendorId", number, kind, status, "customerId",
           "pickupDriverId", "deliveryDriverId"
    FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new DomainError("Order not found", 404);
  return row;
}

async function publish(tx: Tx, event: PortalEvent) {
  await tx.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`;
}

/**
 * Records that `order` entered `status`: timeline event, the notifications it
 * produces (customer, driver, staff), and a realtime ping to the portal.
 * `order` must already reflect the new driver assignments.
 */
export async function recordStatus(
  tx: Tx,
  order: OrderRow,
  status: OrderStatus,
  previous: OrderStatus | undefined,
  actor: ActorRef,
  opts: { note?: string; at?: Date } = {},
) {
  const at = opts.at ?? new Date();
  await tx.orderStatusEvent.create({
    data: {
      orderId: order.id,
      status,
      at,
      actorType: actor.type,
      actorId: actor.id,
      note: opts.note,
    },
  });

  const base = {
    orderId: order.id,
    orderNumber: order.number,
    vendorId: order.vendorId,
    createdAt: at,
  };

  const customerKind = customerKindFor(status, previous);
  if (customerKind) {
    await tx.notification.create({
      data: {
        ...base,
        audience: "mobile",
        mobileUserId: order.customerId,
        kind: customerKind,
      },
    });
  }

  const driverKind = driverKindFor(status);
  const driverId =
    driverKind === "newPickup" ? order.pickupDriverId : order.deliveryDriverId;
  if (driverKind && driverId) {
    await tx.notification.create({
      data: {
        ...base,
        audience: "mobile",
        mobileUserId: driverId,
        kind: driverKind,
      },
    });
  }

  const staffKind = staffKindFor(status, previous);
  if (staffKind) {
    const n = await tx.notification.create({
      data: { ...base, audience: "staff", kind: staffKind },
    });
    await publish(tx, {
      type: "notification",
      vendorId: order.vendorId,
      notificationId: n.id,
      kind: staffKind,
      orderId: order.id,
      orderNumber: order.number,
      status,
    });
  } else {
    await publish(tx, {
      type: "order",
      vendorId: order.vendorId,
      orderId: order.id,
      orderNumber: order.number,
      status,
    });
  }
}

export interface TransitionInput {
  orderId: string;
  transition: TransitionId;
  actor: ActorRef;
  note?: string;
  /**
   * Validates preconditions and writes the transition's own data (driver
   * assignment, invoice, payment…) after the status check passes. May return
   * updated driver ids so notifications reach the right driver.
   */
  apply?: (
    tx: Tx,
    order: OrderRow,
  ) => Promise<Partial<Pick<OrderRow, "pickupDriverId" | "deliveryDriverId">> | void>;
  /** Extra columns to set on the order alongside the status. */
  data?: Prisma.OrderUncheckedUpdateInput;
  /** Called with the locked row before anything changes (ownership checks). */
  guard?: (order: OrderRow) => void;
}

/**
 * The one way an order changes status. Runs in a transaction with the row
 * locked, validates against the workflow, and records the timeline +
 * notifications. A failed pickup is cancelled automatically, as the app's
 * mock (and PRODUCT.md) expect: the customer re-books as a fresh order.
 */
export async function transitionOrder(
  input: TransitionInput,
  client: { $transaction: typeof db.$transaction } = db,
): Promise<OrderRow> {
  return client.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    input.guard?.(order);
    const previous = order.status;
    const next = resolveTransition(input.transition, order, input.actor.type);

    const assigned = (await input.apply?.(tx, order)) ?? {};
    const updated: OrderRow = { ...order, ...assigned, status: next };

    await tx.order.update({
      where: { id: order.id },
      data: { ...input.data, ...assigned, status: next },
    });

    // Reassigning a pickup driver keeps the status; notify the new driver
    // but don't add a duplicate timeline entry.
    if (input.transition === "reassignPickupDriver") {
      if (updated.pickupDriverId) {
        await tx.notification.create({
          data: {
            audience: "mobile",
            mobileUserId: updated.pickupDriverId,
            kind: "newPickup",
            orderId: order.id,
            orderNumber: order.number,
            vendorId: order.vendorId,
          },
        });
      }
      await publish(tx, {
        type: "order",
        vendorId: order.vendorId,
        orderId: order.id,
        orderNumber: order.number,
        status: next,
      });
      return updated;
    }

    await recordStatus(tx, updated, next, previous, input.actor, {
      note: input.note,
    });

    if (next === "pickupFailed") {
      const at = new Date(Date.now() + 1000);
      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled" },
      });
      await recordStatus(
        tx,
        { ...updated, status: "cancelled" },
        "cancelled",
        "pickupFailed",
        { type: "system", id: null },
        { at },
      );
      return { ...updated, status: "cancelled" };
    }
    return updated;
  });
}

export async function audit(
  tx: Tx | typeof db,
  entry: {
    actorId: string | null;
    vendorId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    data?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({ data: entry });
}
