import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { handle, mobileUser, noContent, notFound, ok, readJson } from "@/server/api/http";
import { address as serializeAddress } from "@/server/api/serializers";
import { addressSchema } from "../schema";

type Ctx = RouteContext<"/api/me/addresses/[id]">;

async function owned(req: NextRequest, ctx: Ctx) {
  const me = await mobileUser(req);
  const { id } = await ctx.params;
  const row = await db.address.findFirst({ where: { id, userId: me.id, deletedAt: null } });
  if (!row) throw notFound("Address not found");
  return row;
}

export const PUT = handle(async (req, ctx: Ctx) => {
  const row = await owned(req, ctx);
  const data = await readJson(req, addressSchema);
  const updated = await db.address.update({ where: { id: row.id }, data });
  return ok(serializeAddress(updated));
});

// Soft delete: past orders keep their own address snapshot anyway.
export const DELETE = handle(async (req, ctx: Ctx) => {
  const row = await owned(req, ctx);
  await db.address.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  return noContent();
});
