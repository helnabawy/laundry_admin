import { db } from "@/server/db";
import { defaultVendor } from "@/server/auth/scope";
import { handle, langOf, mobileUser, ok, readJson, HttpError } from "@/server/api/http";
import { order, orderInclude } from "@/server/api/serializers";
import { createOrder, newOrderSchema } from "@/server/orders/create";

export const GET = handle(async (req) => {
  const me = await mobileUser(req);
  const rows = await db.order.findMany({
    where: { customerId: me.id },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const lang = langOf(req);
  return ok(rows.map((o) => order(lang, o)));
});

export const POST = handle(async (req) => {
  const me = await mobileUser(req);
  if (me.role !== "customer") throw new HttpError(403, "Only customers can place orders");
  const params = await readJson(req, newOrderSchema);
  const vendor = await defaultVendor();
  const id = await createOrder({ vendorId: vendor.id, customerId: me.id, params });
  const created = await db.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  return ok(order(langOf(req), created), 201);
});
