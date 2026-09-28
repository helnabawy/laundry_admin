import { db } from "@/server/db";
import { defaultVendor } from "@/server/auth/scope";
import { handle, langOf, ok } from "@/server/api/http";
import { product } from "@/server/api/serializers";

export const GET = handle(async (req) => {
  const vendor = await defaultVendor();
  const rows = await db.product.findMany({
    where: { vendorId: vendor.id, isActive: true, category: { isActive: true } },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const lang = langOf(req);
  return ok(rows.map((p) => product(lang, p)));
});
