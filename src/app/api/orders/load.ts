import "server-only";
import type { MobileUser } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { notFound, ok, type Lang } from "@/server/api/http";
import { order, orderInclude } from "@/server/api/serializers";

/**
 * An order is visible to the customer who placed it and to the drivers
 * assigned to its pickup or delivery (the driver app opens task details
 * through GET /api/orders/{id}). Anyone else gets a 404, not a 403, so ids
 * can't be probed.
 */
export async function visibleOrderResponse(lang: Lang, user: Pick<MobileUser, "id" | "role">, id: string) {
  const row = await db.order.findUnique({ where: { id }, include: orderInclude });
  const visible =
    row &&
    (user.role === "driver"
      ? row.pickupDriverId === user.id || row.deliveryDriverId === user.id
      : row.customerId === user.id);
  if (!visible) throw notFound("Order not found");
  return ok(order(lang, row));
}

/** Loads an order the customer owns and returns it as the app's JSON. */
export async function customerOrderResponse(lang: Lang, customerId: string, id: string) {
  return visibleOrderResponse(lang, { id: customerId, role: "customer" }, id);
}
