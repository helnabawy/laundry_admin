import { db } from "@/server/db";
import { handle, mobileUser, ok } from "@/server/api/http";
import { notification } from "@/server/api/serializers";

export const GET = handle(async (req) => {
  const me = await mobileUser(req);
  const rows = await db.notification.findMany({
    where: { audience: "mobile", mobileUserId: me.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(rows.map(notification));
});
