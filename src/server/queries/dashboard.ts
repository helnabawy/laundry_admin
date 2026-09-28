import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { vendorWhere } from "@/server/auth/scope";
import type { Session } from "@/server/auth/session";
import { BOARD_COLUMNS, type BoardColumnId, type OrderStatus } from "@/domain/order-workflow";
import { localDateOf } from "@/domain/slots";

export type RangeDays = 7 | 30 | 90;

export interface DashboardData {
  range: RangeDays;
  tally: { column: BoardColumnId; count: number }[];
  orders: number;
  shopOrders: number;
  revenue: number;
  paidInvoices: number;
  turnaroundHours: number | null;
  failedStops: number;
  rating: { avg: number | null; count: number };
  perDay: { date: string; shop: number; quick: number; revenue: number }[];
  byStatus: { status: OrderStatus; count: number }[];
  topProducts: { nameEn: string; nameAr: string; quantity: number }[];
  tiers: { nameEn: string; nameAr: string; isVip: boolean; count: number }[];
  slots: { windowId: string; startMinute: number | null; count: number }[];
}

/** Dashboard aggregates for the period, in the viewer's vendor scope. */
export async function dashboardData(session: Session, range: RangeDays): Promise<DashboardData> {
  const scope = await vendorWhere(session);
  const vendorId = scope.vendorId ?? null;
  const since = new Date(Date.now() - range * 86_400_000);
  const vendorSql = vendorId ? Prisma.sql`AND o."vendorId" = ${vendorId}` : Prisma.empty;

  const [openByStatus, periodOrders, revenueRows, perDayOrders, perDayRevenue, turnaround, failedStops, rating, byStatus, topProducts, tiers, slotRows, windows] =
    await Promise.all([
      db.order.groupBy({
        by: ["status"],
        where: { ...scope, status: { in: BOARD_COLUMNS.flatMap((c) => [...c.statuses]) } },
        _count: { _all: true },
      }),
      db.order.groupBy({ by: ["kind"], where: { ...scope, createdAt: { gte: since } }, _count: { _all: true } }),
      db.$queryRaw<{ revenue: number | null; invoices: bigint }[]>`
        SELECT COALESCE(SUM(t.total), 0)::float AS revenue, COUNT(*) AS invoices FROM (
          SELECT i.id, SUM(it.quantity * it."unitPrice") + i."vipSurcharge" + i."codFee" AS total
          FROM "Invoice" i
          JOIN "Order" o ON o.id = i."orderId"
          JOIN "InvoiceItem" it ON it."invoiceId" = i.id
          WHERE i.paid AND i."paidAt" >= ${since} ${vendorSql}
          GROUP BY i.id) t`,
      db.$queryRaw<{ day: string; kind: string; n: bigint }[]>`
        SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, o.kind::text AS kind, COUNT(*) AS n
        FROM "Order" o WHERE o."createdAt" >= ${since} ${vendorSql}
        GROUP BY 1, 2`,
      db.$queryRaw<{ day: string; revenue: number }[]>`
        SELECT to_char(t."paidAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, SUM(t.total)::float AS revenue FROM (
          SELECT i."paidAt", SUM(it.quantity * it."unitPrice") + i."vipSurcharge" + i."codFee" AS total
          FROM "Invoice" i
          JOIN "Order" o ON o.id = i."orderId"
          JOIN "InvoiceItem" it ON it."invoiceId" = i.id
          WHERE i.paid AND i."paidAt" >= ${since} ${vendorSql}
          GROUP BY i.id) t
        GROUP BY 1`,
      db.$queryRaw<{ hours: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (e.at - o."createdAt")) / 3600)::float AS hours
        FROM "Order" o JOIN "OrderStatusEvent" e ON e."orderId" = o.id AND e.status = 'delivered'
        WHERE e.at >= ${since} ${vendorSql}`,
      db.taskFailure.count({ where: { createdAt: { gte: since }, order: scope } }),
      db.orderRating.aggregate({
        where: { ratedAt: { gte: since }, order: scope },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      db.order.groupBy({ by: ["status"], where: { ...scope, createdAt: { gte: since } }, _count: { _all: true } }),
      db.$queryRaw<{ nameEn: string; nameAr: string; quantity: bigint }[]>`
        SELECT it."nameEn", it."nameAr", SUM(it.quantity) AS quantity
        FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId" JOIN "Order" o ON o.id = i."orderId"
        WHERE o."createdAt" >= ${since} ${vendorSql}
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`,
      db.$queryRaw<{ nameEn: string; nameAr: string; isVip: boolean; n: bigint }[]>`
        SELECT t."nameEn", t."nameAr", t."isVip", COUNT(*) AS n
        FROM "Order" o JOIN "ServiceTier" t ON t.id = o."tierId"
        WHERE o."createdAt" >= ${since} ${vendorSql}
        GROUP BY 1, 2, 3 ORDER BY 4 DESC`,
      db.$queryRaw<{ windowId: string; n: bigint }[]>`
        SELECT substring(o."pickupSlotId" from 12) AS "windowId", COUNT(*) AS n
        FROM "Order" o WHERE o."pickupStart" >= ${since} ${vendorSql}
        GROUP BY 1`,
      db.slotWindow.findMany({ where: scope, select: { id: true, startMinute: true } }),
    ]);

  const statusCount = new Map(openByStatus.map((r) => [r.status, r._count._all]));
  const tally = BOARD_COLUMNS.map((c) => ({
    column: c.id,
    count: c.statuses.reduce((s, st) => s + (statusCount.get(st) ?? 0), 0),
  }));

  // One row per day in the range, zero-filled.
  const days: string[] = [];
  for (let i = range - 1; i >= 0; i--) days.push(localDateOf(new Date(Date.now() - i * 86_400_000)));
  const perDayMap = new Map(days.map((d) => [d, { date: d, shop: 0, quick: 0, revenue: 0 }]));
  for (const r of perDayOrders) {
    const row = perDayMap.get(r.day);
    if (row) row[r.kind === "SHOP" ? "shop" : "quick"] += Number(r.n);
  }
  for (const r of perDayRevenue) {
    const row = perDayMap.get(r.day);
    if (row) row.revenue = Math.round(r.revenue * 100) / 100;
  }

  const windowStart = new Map(windows.map((w) => [w.id, w.startMinute]));
  const orders = periodOrders.reduce((s, r) => s + r._count._all, 0);

  return {
    range,
    tally,
    orders,
    shopOrders: periodOrders.find((r) => r.kind === "SHOP")?._count._all ?? 0,
    revenue: Math.round((revenueRows[0]?.revenue ?? 0) * 100) / 100,
    paidInvoices: Number(revenueRows[0]?.invoices ?? 0),
    turnaroundHours: turnaround[0]?.hours ?? null,
    failedStops,
    rating: { avg: rating._avg.stars, count: rating._count._all },
    perDay: [...perDayMap.values()],
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })).sort((a, b) => b.count - a.count),
    topProducts: topProducts.map((r) => ({ nameEn: r.nameEn, nameAr: r.nameAr, quantity: Number(r.quantity) })),
    tiers: tiers.map((r) => ({ nameEn: r.nameEn, nameAr: r.nameAr, isVip: r.isVip, count: Number(r.n) })),
    slots: slotRows
      .map((r) => ({ windowId: r.windowId, startMinute: windowStart.get(r.windowId) ?? null, count: Number(r.n) }))
      .sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0)),
  };
}
