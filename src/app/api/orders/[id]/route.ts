import { handle, langOf, mobileUser } from "@/server/api/http";
import { visibleOrderResponse } from "../load";

// The customer's own order, or a task assigned to the calling driver.
export const GET = handle(async (req, ctx: RouteContext<"/api/orders/[id]">) => {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  return visibleOrderResponse(langOf(req), me, id);
});
