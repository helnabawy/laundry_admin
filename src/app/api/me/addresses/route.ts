import { db } from "@/server/db";
import { handle, mobileUser, ok, readJson } from "@/server/api/http";
import { address as serializeAddress } from "@/server/api/serializers";
import { addressSchema } from "./schema";

export const GET = handle(async (req) => {
  const me = await mobileUser(req);
  const rows = await db.address.findMany({
    where: { userId: me.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return ok(rows.map(serializeAddress));
});

export const POST = handle(async (req) => {
  const me = await mobileUser(req);
  const data = await readJson(req, addressSchema);
  const row = await db.address.create({ data: { ...data, userId: me.id } });
  return ok(serializeAddress(row), 201);
});
