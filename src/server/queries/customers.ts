import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { Session } from "@/server/auth/session";
import { ticketInclude, toTicket } from "./orders";

/**
 * App users: everyone who signs in to the mobile app with a mobile number.
 *
 * - Super admin: every app user in the system — customers and drivers, in
 *   all laundries. The laundry switcher doesn't narrow this list.
 * - Laundry admin: the customers who have ordered from their laundry (their
 *   own drivers are on the Drivers page).
 */

export const CUSTOMER_PAGE_SIZE = 25;

export type AppUserRole = "customer" | "driver";

export interface CustomerFilters {
  q?: string;
  status?: "active" | "blocked";
  /** Super admin only; admins always see customers. */
  role?: AppUserRole;
  page?: number;
}

export interface CustomerRow {
  id: string;
  fullName: string | null;
  phone: string;
  role: AppUserRole;
  /** A driver's laundry. Customers belong to no single laundry. */
  vendor: { en: string; ar: string } | null;
  isActive: boolean;
  createdAt: Date;
  orders: number;
  lastOrderAt: Date | null;
  paidTotal: number;
}

/**
 * Deliberately not `vendorWhere`: the super admin sees all app users even
 * while the laundry switcher narrows other pages.
 */
function scopeOf(session: Session): { vendorId?: string } {
  return session.vendorId ? { vendorId: session.vendorId } : {};
}

function customerWhere(scope: { vendorId?: string }, f: CustomerFilters): Prisma.MobileUserWhereInput {
  const and: Prisma.MobileUserWhereInput[] = [];
  if (scope.vendorId) {
    and.push({ role: "customer", orders: { some: { vendorId: scope.vendorId } } });
  } else if (f.role) {
    and.push({ role: f.role });
  }
  if (f.status === "active") and.push({ isActive: true });
  if (f.status === "blocked") and.push({ isActive: false });
  if (f.q?.trim()) {
    const q = f.q.trim();
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  return { AND: and };
}

/** Paid invoice totals per customer, in the viewer's scope. */
async function paidTotals(ids: string[], vendorId?: string): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const vendorSql = vendorId ? Prisma.sql`AND o."vendorId" = ${vendorId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ customerId: string; total: number }[]>`
    SELECT t."customerId", SUM(t.total)::float AS total FROM (
      SELECT o."customerId", SUM(it.quantity * it."unitPrice") + i."vipSurcharge" + i."codFee" AS total
      FROM "Invoice" i
      JOIN "Order" o ON o.id = i."orderId"
      JOIN "InvoiceItem" it ON it."invoiceId" = i.id
      WHERE i.paid AND o."customerId" IN (${Prisma.join(ids)}) ${vendorSql}
      GROUP BY i.id, o."customerId") t
    GROUP BY t."customerId"`;
  return new Map(rows.map((r) => [r.customerId, Math.round(r.total * 100) / 100]));
}

export async function listCustomers(session: Session, filters: CustomerFilters) {
  const scope = scopeOf(session);
  const where = customerWhere(scope, filters);
  const page = Math.max(1, filters.page ?? 1);
  const orderScope = scope.vendorId ? { vendorId: scope.vendorId } : {};
  const [rows, total] = await Promise.all([
    db.mobileUser.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
      include: {
        _count: { select: { orders: { where: orderScope } } },
        orders: { where: orderScope, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        vendor: { select: { nameEn: true, nameAr: true } },
      },
    }),
    db.mobileUser.count({ where }),
  ]);
  const paid = await paidTotals(rows.map((r) => r.id), scope.vendorId);
  const list: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    role: r.role,
    vendor: r.vendor ? { en: r.vendor.nameEn, ar: r.vendor.nameAr } : null,
    isActive: r.isActive,
    createdAt: r.createdAt,
    orders: r._count.orders,
    lastOrderAt: r.orders[0]?.createdAt ?? null,
    paidTotal: paid.get(r.id) ?? 0,
  }));
  return { rows: list, total, page, pages: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)) };
}

export async function customerDetail(session: Session, id: string) {
  const scope = scopeOf(session);
  const customer = await db.mobileUser.findFirst({
    where: { AND: [{ id }, customerWhere(scope, {})] },
    include: {
      addresses: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      vendor: { select: { nameEn: true, nameAr: true } },
    },
  });
  if (!customer) return null;
  const orderScope = scope.vendorId ? { vendorId: scope.vendorId } : {};
  // A customer's own orders; a driver's collections and deliveries.
  const orderWhere =
    customer.role === "driver"
      ? { OR: [{ pickupDriverId: id }, { deliveryDriverId: id }] }
      : { customerId: id, ...orderScope };
  const [orders, orderCount, paid] = await Promise.all([
    db.order.findMany({ where: orderWhere, include: ticketInclude, orderBy: { createdAt: "desc" }, take: 20 }),
    db.order.count({ where: orderWhere }),
    customer.role === "driver" ? Promise.resolve(new Map<string, number>()) : paidTotals([id], scope.vendorId),
  ]);
  return {
    customer,
    orders: orders.map(toTicket),
    orderCount,
    paidTotal: paid.get(id) ?? 0,
  };
}
