import { z } from "zod";
import { handle, langOf, mobileUser, readJson } from "@/server/api/http";
import { retryPayment } from "@/server/payments/service";
import { customerOrderResponse } from "../../load";

/**
 * Opens a fresh checkout for an order whose online payment was declined,
 * cancelled or expired. Returns the order; `invoice.payment.checkoutUrl` is
 * the page to send the customer to.
 */
export const POST = handle(async (req, ctx: RouteContext<"/api/orders/[id]/payments">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const body = await readJson(
    req,
    z.object({ method: z.enum(["card", "payLater"]).optional() }),
  );
  await retryPayment(me.id, id, body.method);
  return customerOrderResponse(langOf(req), me.id, id);
});
