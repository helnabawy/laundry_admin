import { z } from "zod";
import { db } from "@/server/db";
import { handle, mobileUser, ok, readJson } from "@/server/api/http";
import { user as serializeUser } from "@/server/api/serializers";

export const PUT = handle(async (req) => {
  const me = await mobileUser(req);
  const { fullName } = await readJson(
    req,
    z.object({ fullName: z.string().trim().min(1).max(120) }),
  );
  const updated = await db.mobileUser.update({
    where: { id: me.id },
    data: { fullName },
    include: { _count: { select: { addresses: { where: { deletedAt: null } } } } },
  });
  return ok(serializeUser(updated));
});
