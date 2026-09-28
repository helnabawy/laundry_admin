import { handle, mobileDriver, ok } from "@/server/api/http";
import { user as serializeUser } from "@/server/api/serializers";

export const GET = handle(async (req) => {
  const me = await mobileDriver(req);
  return ok({ ...serializeUser(me), available: me.isAvailable });
});
