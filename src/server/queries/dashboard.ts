import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { spansLaundries, vendorSql as scopeSql, vendorWhere } from "@/server/auth/scope";
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
  /** One row per laundry — only when a super admin is looking at all of them. */
  laundries: LaundryRow[] | null;
}

export interface LaundryRow {
  id: string;
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  orders: number;
  open: number;
  revenue: number;
  paidInvoices: number;
  turnaroundHours: number | null;
  failedStops: number;
  rating: number | null;
  ratingCount: number;
}

/**
 * The period's headline numbers per laundry, oldest laundry first. `vendorSql`
 * limits it to the viewer's laundries (a laundry admin's comparison shows
 * only theirs).
 */
async function laundryComparison(since: Date, vendorSql: Prisma.Sql): Promise<LaundryRow[]> {
  const openStatuses = BOARD_COLUMNS.flatMap((c) => [...c.statuses]);
  const rows = await db.$queryRaw<
    {
      id: string;
      nameEn: string;
      nameAr: string;
      isActive: boolean;
      orders: bigint;
      open: bigint;
      revenue: number | null;
      invoices: bigint;
      hours: number | null;
      failed: bigint;
      rating: number | null;
      ratings: bigint;
    }[]
  >`
    SELECT v.id, v."nameEn", v."nameAr", v."isActive",
      (SELECT COUNT(*) FROM "Order" o WHERE o."vendorId" = v.id AND o."createdAt" >= ${since}) AS orders,
      (SELECT COUNT(*) FROM "Order" o WHERE o."vendorId" = v.id AND o.status::text = ANY(${openStatuses})) AS open,
      ((SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p
         WHERE p."vendorId" = v.id AND p.status IN ('succeeded', 'partiallyRefunded', 'refunded') AND p."paidAt" >= ${since})
       - (SELECT COALESCE(SUM(r.amount), 0) FROM "Refund" r WHERE r."vendorId" = v.id AND r."createdAt" >= ${since}))::float AS revenue,
      (SELECT COUNT(DISTINCT p."invoiceId") FROM "Payment" p
         WHERE p."vendorId" = v.id AND p.status IN ('succeeded', 'partiallyRefunded', 'refunded') AND p."paidAt" >= ${since}) AS invoices,
      (SELECT AVG(EXTRACT(EPOCH FROM (e.at - o."createdAt")) / 3600)::float
         FROM "Order" o JOIN "OrderStatusEvent" e ON e."orderId" = o.id AND e.status = 'delivered'
         WHERE o."vendorId" = v.id AND e.at >= ${since}) AS hours,
      (SELECT COUNT(*) FROM "TaskFailure" f JOIN "Order" o ON o.id = f."orderId"
         WHERE o."vendorId" = v.id AND f."createdAt" >= ${since}) AS failed,
      (SELECT AVG(r.stars)::float FROM "OrderRating" r JOIN "Order" o ON o.id = r."orderId"
         WHERE o."vendorId" = v.id AND r."ratedAt" >= ${since}) AS rating,
      (SELECT COUNT(*) FROM "OrderRating" r JOIN "Order" o ON o.id = r."orderId"
         WHERE o."vendorId" = v.id AND r."ratedAt" >= ${since}) AS ratings
    FROM "Vendor" v
    WHERE TRUE ${vendorSql}
    ORDER BY v."createdAt" ASC`;
  return rows.map((r) => ({
    id: r.id,
    nameEn: r.nameEn,
    nameAr: r.nameAr,
    isActive: r.isActive,
    orders: Number(r.orders),
    open: Number(r.open),
    revenue: Math.round((r.revenue ?? 0) * 100) / 100,
    paidInvoices: Number(r.invoices),
    turnaroundHours: r.hours,
    failedStops: Number(r.failed),
    rating: r.rating,
    ratingCount: Number(r.ratings),
  }));
}

/**
 * Pickups per window, merged by start time: across all laundries, two
 * laundries' 09:00 windows are one bar, not two bars with the same label.
 */
function slotsByStart(rows: { windowId: string; n: bigint }[], windowStart: Map<string, number>) {
  const byStart = new Map<string, { windowId: string; startMinute: number | null; count: number }>();
  for (const r of rows) {
    const startMinute = windowStart.get(r.windowId) ?? null;
    const key = startMinute === null ? `?${r.windowId}` : String(startMinute);
    const row = byStart.get(key) ?? { windowId: r.windowId, startMinute, count: 0 };
    row.count += Number(r.n);
    byStart.set(key, row);
  }
  return [...byStart.values()].sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
}

/** Dashboard aggregates for the period, in the viewer's vendor scope. */
export async function dashboardData(session: Session, range: RangeDays): Promise<DashboardData> {
  const scope = await vendorWhere(session);
  const since = new Date(Date.now() - range * 86_400_000);
  const vendorSql = await scopeSql(session, Prisma.sql`o."vendorId"`);

  const [openByStatus, periodOrders, revenueRows, perDayOrders, perDayRevenue, turnaround, failedStops, rating, byStatus, topProducts, tiers, slotRows, windows] =
    await Promise.all([
      db.order.groupBy({
        by: ["status"],
        where: { ...scope, status: { in: BOARD_COLUMNS.flatMap((c) => [...c.statuses]) } },
        _count: { _all: true },
      }),
      db.order.groupBy({ by: ["kind"], where: { ...scope, createdAt: { gte: since } }, _count: { _all: true } }),
      // Revenue is money actually taken (the payment ledger), net of refunds.
      db.$queryRaw<{ revenue: number | null; invoices: bigint }[]>`
        SELECT
          (COALESCE((SELECT SUM(o.amount) FROM "Payment" o
                      WHERE o.status IN ('succeeded', 'partiallyRefunded', 'refunded') AND o."paidAt" >= ${since} ${vendorSql}), 0)
           - COALESCE((SELECT SUM(o.amount) FROM "Refund" o WHERE o."createdAt" >= ${since} ${vendorSql}), 0))::float AS revenue,
          (SELECT COUNT(DISTINCT o."invoiceId") FROM "Payment" o
            WHERE o.status IN ('succeeded', 'partiallyRefunded', 'refunded') AND o."paidAt" >= ${since} ${vendorSql}) AS invoices`,
      db.$queryRaw<{ day: string; kind: string; n: bigint }[]>`
        SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, o.kind::text AS kind, COUNT(*) AS n
        FROM "Order" o WHERE o."createdAt" >= ${since} ${vendorSql}
        GROUP BY 1, 2`,
      db.$queryRaw<{ day: string; revenue: number }[]>`
        SELECT day, SUM(amount)::float AS revenue FROM (
          SELECT to_char(o."paidAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, o.amount
          FROM "Payment" o
          WHERE o.status IN ('succeeded', 'partiallyRefunded', 'refunded') AND o."paidAt" >= ${since} ${vendorSql}
          UNION ALL
          SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD'), -o.amount
          FROM "Refund" o WHERE o."createdAt" >= ${since} ${vendorSql}) t
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
  // Side-by-side laundries only when the view spans more than one.
  const laundries = (await spansLaundries(session))
    ? await laundryComparison(since, await scopeSql(session, Prisma.sql`v.id`))
    : null;

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
    slots: slotsByStart(slotRows, windowStart),
    // A single laundry needs no comparison.
    laundries: laundries && laundries.length > 1 ? laundries : null,
  };
}
