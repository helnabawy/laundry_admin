import { db } from "@/server/db";
import { defaultVendor } from "@/server/auth/scope";
import { handle, langOf, ok } from "@/server/api/http";
import { category } from "@/server/api/serializers";

export const GET = handle(async (req) => {
  const vendor = await defaultVendor();
  const rows = await db.serviceCategory.findMany({
    where: { vendorId: vendor.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const lang = langOf(req);
  return ok(rows.map((c) => category(lang, c)));
});
