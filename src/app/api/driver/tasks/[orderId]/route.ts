import { db } from "@/server/db";
import { handle, langOf, mobileDriver, notFound, ok } from "@/server/api/http";
import { order, orderInclude } from "@/server/api/serializers";

export const GET = handle(async (req, ctx: RouteContext<"/api/driver/tasks/[orderId]">) => {
  const me = await mobileDriver(req);
  const { orderId } = await ctx.params;
  const row = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!row || (row.pickupDriverId !== me.id && row.deliveryDriverId !== me.id)) {
    throw notFound("Task not found");
  }
  const type = row.deliveryDriverId === me.id && row.status === "outForDelivery" ? "delivery" : "pickup";
  return ok({ type, order: order(langOf(req), row) });
});
