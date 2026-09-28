import { z } from "zod";
import { db } from "@/server/db";
import { handle, mobileDriver, ok, readJson } from "@/server/api/http";

export const POST = handle(async (req) => {
  const me = await mobileDriver(req);
  const { available } = await readJson(req, z.object({ available: z.boolean() }));
  await db.mobileUser.update({ where: { id: me.id }, data: { isAvailable: available } });
  return ok({ available });
});
