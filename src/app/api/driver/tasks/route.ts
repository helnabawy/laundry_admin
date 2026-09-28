import { db } from "@/server/db";
import { handle, langOf, mobileDriver, ok } from "@/server/api/http";
import { order, orderInclude, type FullOrder } from "@/server/api/serializers";

// GET /api/driver/tasks?status=today|completed
export const GET = handle(async (req) => {
  const me = await mobileDriver(req);
  const lang = langOf(req);
  const task = (type: "pickup" | "delivery", o: FullOrder) => ({ type, order: order(lang, o) });

  if (req.nextUrl.searchParams.get("status") === "completed") {
    const rows = await db.order.findMany({
      where: {
        OR: [
          { deliveryDriverId: me.id, status: { in: ["delivered", "deliveryFailed"] } },
          { pickupDriverId: me.id, failures: { some: { stage: "pickup", driverId: me.id } } },
        ],
      },
      include: orderInclude,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return ok(
      rows.map((o) =>
        task(o.deliveryDriverId === me.id && o.status !== "cancelled" ? "delivery" : "pickup", o),
      ),
    );
  }

  const rows = await db.order.findMany({
    where: {
      OR: [
        { pickupDriverId: me.id, status: "driverAssigned" },
        { deliveryDriverId: me.id, status: "outForDelivery" },
      ],
    },
    include: orderInclude,
    orderBy: { pickupStart: "asc" },
  });
  return ok(rows.map((o) => task(o.status === "driverAssigned" ? "pickup" : "delivery", o)));
});
