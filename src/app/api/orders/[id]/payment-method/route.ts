import { z } from "zod";
import { handle, langOf, mobileUser, readJson } from "@/server/api/http";
import { choosePaymentMethod } from "@/server/orders/mobile";
import { customerOrderResponse } from "../../load";

export const POST = handle(async (req, ctx: RouteContext<"/api/orders/[id]/payment-method">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const body = await readJson(
    req,
    z.object({
      method: z.enum(["card", "cashOnDelivery"]),
      conditionsAcknowledged: z.boolean().default(false),
    }),
  );
  await choosePaymentMethod(me.id, id, body.method, body.conditionsAcknowledged);
  return customerOrderResponse(langOf(req), me.id, id);
});
