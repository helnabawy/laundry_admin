import "server-only";
import { db } from "@/server/db";
import { notFound, ok, type Lang } from "@/server/api/http";
import { order, orderInclude } from "@/server/api/serializers";

/** Loads an order the customer owns and returns it as the app's JSON. */
export async function customerOrderResponse(lang: Lang, customerId: string, id: string) {
  const row = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!row || row.customerId !== customerId) throw notFound("Order not found");
  return ok(order(lang, row));
}
