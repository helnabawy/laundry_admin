import { db } from "@/server/db";
import { defaultVendor } from "@/server/auth/scope";
import { handle, langOf, notFound, ok } from "@/server/api/http";
import { subService } from "@/server/api/serializers";

export const GET = handle(async (req, ctx: RouteContext<"/api/service-categories/[id]/sub-services">) => {
  const { id } = await ctx.params;
  const vendor = await defaultVendor();
  const cat = await db.serviceCategory.findFirst({
    where: { id, vendorId: vendor.id, isActive: true },
  });
  if (!cat) throw notFound("Category not found");
  const rows = await db.subService.findMany({
    where: { categoryId: id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const lang = langOf(req);
  return ok(rows.map((s) => subService(lang, s)));
});
