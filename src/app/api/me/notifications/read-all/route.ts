import { db } from "@/server/db";
import { handle, mobileUser, noContent } from "@/server/api/http";

export const POST = handle(async (req) => {
  const me = await mobileUser(req);
  await db.notification.updateMany({
    where: { audience: "mobile", mobileUserId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  return noContent();
});
