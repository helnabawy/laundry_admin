import { db } from "@/server/db";
import { handle, langOf, mobileUser, notFound, ok } from "@/server/api/http";
import { invoice, orderInclude } from "@/server/api/serializers";

export const GET = handle(async (req, ctx: RouteContext<"/api/orders/[id]/invoice">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const row = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!row || row.customerId !== me.id || !row.invoice) throw notFound("Invoice not found");
  return ok(invoice(langOf(req), row.invoice));
});
