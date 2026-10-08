import { db } from "@/server/db";
import { handle, mobileUser, notFound, ok } from "@/server/api/http";
import { payment } from "@/server/api/serializers";
import { expireIfStale } from "@/server/payments/service";

/** The app polls this after sending the customer to a hosted checkout. */
export const GET = handle(async (req, ctx: RouteContext<"/api/payments/[id]">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const row = await db.payment.findUnique({
    where: { id },
    include: { order: { select: { customerId: true } } },
  });
  if (!row || row.order.customerId !== me.id) throw notFound("Payment not found");
  return ok({ ...payment(await expireIfStale(row)), orderId: row.orderId });
});
