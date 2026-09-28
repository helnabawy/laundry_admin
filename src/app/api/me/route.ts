import { db } from "@/server/db";
import { handle, mobileUser, ok } from "@/server/api/http";
import { user as serializeUser } from "@/server/api/serializers";

export const GET = handle(async (req) => {
  const me = await mobileUser(req);
  const count = await db.address.count({ where: { userId: me.id, deletedAt: null } });
  return ok(serializeUser({ ...me, _count: { addresses: count } }));
});
