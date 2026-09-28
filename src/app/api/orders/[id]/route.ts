import { handle, langOf, mobileUser } from "@/server/api/http";
import { customerOrderResponse } from "../load";

export const GET = handle(async (req, ctx: RouteContext<"/api/orders/[id]">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  return customerOrderResponse(langOf(req), me.id, id);
});
