import { db } from "@/server/db";
import { handle, langOf, ok } from "@/server/api/http";
import { vendor } from "@/server/api/serializers";

// GET /api/vendors — the laundries a customer can order from, oldest first.
// Public: the app shows the picker before it needs a session.
export const GET = handle(async (req) => {
  const rows = await db.vendor.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const lang = langOf(req);
  return ok(rows.map((v) => vendor(lang, v)));
});
