import { z } from "zod";
import { handle, langOf, mobileUser, readJson } from "@/server/api/http";
import { rateOrder } from "@/server/orders/mobile";
import { customerOrderResponse } from "../../load";

export const POST = handle(async (req, ctx: RouteContext<"/api/orders/[id]/rating">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const body = await readJson(
    req,
    z.object({ stars: z.number().int(), comment: z.string().max(1000).nullish() }),
  );
  await rateOrder(me.id, id, body.stars, body.comment);
  return customerOrderResponse(langOf(req), me.id, id);
});
