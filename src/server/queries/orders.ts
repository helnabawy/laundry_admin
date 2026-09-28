import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { vendorWhere } from "@/server/auth/scope";
import type { Session } from "@/server/auth/session";
import { BOARD_COLUMNS, type OrderKind, type OrderStatus } from "@/domain/order-workflow";
import { invoiceTotals } from "@/domain/pricing";

const BOARD_STATUSES = BOARD_COLUMNS.flatMap((c) => [...c.statuses]) as OrderStatus[];

export interface TicketView {
  id: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  area: string;
  isVip: boolean;
  tierName: { en: string; ar: string };
  pickupStart: string;
  pickupEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  since: string;
  pickupDriver: string | null;
  deliveryDriver: string | null;
  total: number | null;
  paid: boolean | null;
  paymentMethod: "card" | "cashOnDelivery" | null;
  itemCount: number;
  vendorId: string;
  vendorName: { en: string; ar: string };
}

const ticketInclude = {
  tier: { select: { nameEn: true, nameAr: true, isVip: true, surchargeType: true, surchargeValue: true } },
  events: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
  pickupDriver: { select: { fullName: true, phone: true } },
  deliveryDriver: { select: { fullName: true, phone: true } },
  invoice: { include: { items: { select: { quantity: true, unitPrice: true } } } },
  vendor: { select: { nameEn: true, nameAr: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.OrderInclude;

type TicketRow = Prisma.OrderGetPayload<{ include: typeof ticketInclude }>;

export function invoiceTotal(inv: NonNullable<TicketRow["invoice"]>): number {
  const lines = inv.items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) }));
  const base = invoiceTotals({
    lines,
    tier: { surchargeType: "none", surchargeValue: 0 },
    vendorCodFee: 0,
  });
  return Math.round((base.subtotal + Number(inv.vipSurcharge) + Number(inv.codFee)) * 100) / 100;
}

function toTicket(o: TicketRow): TicketView {
  const address = o.addressSnapshot as { area?: string } | null;
  return {
    id: o.id,
    number: o.number,
    kind: o.kind,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    area: address?.area ?? "",
    isVip: o.tier.isVip,
    tierName: { en: o.tier.nameEn, ar: o.tier.nameAr },
    pickupStart: o.pickupStart.toISOString(),
    pickupEnd: o.pickupEnd.toISOString(),
    deliveryStart: o.deliveryStart.toISOString(),
    deliveryEnd: o.deliveryEnd.toISOString(),
    since: (o.events[0]?.at ?? o.updatedAt).toISOString(),
    pickupDriver: o.pickupDriver?.fullName ?? o.pickupDriver?.phone ?? null,
    deliveryDriver: o.deliveryDriver?.fullName ?? o.deliveryDriver?.phone ?? null,
    total: o.invoice ? invoiceTotal(o.invoice) : null,
    paid: o.invoice ? o.invoice.paid : null,
    paymentMethod: o.invoice?.paymentMethod ?? null,
    itemCount: o.invoice ? o.invoice.items.reduce((s, i) => s + i.quantity, 0) : o._count.lines,
    vendorId: o.vendorId,
    vendorName: { en: o.vendor.nameEn, ar: o.vendor.nameAr },
  };
}

/** Every order the laundry still has work or attention on. */
export async function boardTickets(session: Session): Promise<TicketView[]> {
  const scope = await vendorWhere(session);
  const rows = await db.order.findMany({
    where: { ...scope, status: { in: BOARD_STATUSES } },
    include: ticketInclude,
    orderBy: [{ pickupStart: "asc" }, { number: "asc" }],
    take: 500,
  });
  return rows.map(toTicket);
}

export interface OrderFilters {
  q?: string;
  status?: OrderStatus | "active" | "done";
  kind?: OrderKind;
  from?: Date;
  to?: Date;
  page?: number;
}

export const PAGE_SIZE = 25;

export function orderWhere(
  scope: { vendorId?: string },
  f: Omit<OrderFilters, "page"> & {
    tierId?: string;
    driverId?: string;
    paymentMethod?: "card" | "cashOnDelivery" | "none";
    paid?: boolean;
    categoryId?: string;
  },
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { ...scope };
  const and: Prisma.OrderWhereInput[] = [];
  if (f.q) {
    const q = f.q.trim();
    const digits = q.replace(/\D/g, "");
    const or: Prisma.OrderWhereInput[] = [{ customerName: { contains: q, mode: "insensitive" } }];
    if (/^\d{1,9}$/.test(q)) or.push({ number: Number(q) });
    if (digits.length >= 4) or.push({ customerPhone: { contains: digits } });
    and.push({ OR: or });
  }
  if (f.status === "active") and.push({ status: { notIn: ["delivered", "cancelled"] } });
  else if (f.status === "done") and.push({ status: { in: ["delivered", "cancelled"] } });
  else if (f.status) and.push({ status: f.status });
  if (f.kind) and.push({ kind: f.kind });
  if (f.from || f.to) and.push({ createdAt: { gte: f.from, lt: f.to } });
  if (f.tierId) and.push({ tierId: f.tierId });
  if (f.driverId) and.push({ OR: [{ pickupDriverId: f.driverId }, { deliveryDriverId: f.driverId }] });
  if (f.paymentMethod === "none") and.push({ OR: [{ invoice: null }, { invoice: { paymentMethod: null } }] });
  else if (f.paymentMethod) and.push({ invoice: { paymentMethod: f.paymentMethod } });
  if (f.paid !== undefined) and.push({ invoice: { paid: f.paid } });
  if (f.categoryId)
    and.push({
      OR: [
        { lines: { some: { categoryId: f.categoryId } } },
        { invoice: { items: { some: { categoryId: f.categoryId } } } },
      ],
    });
  if (and.length) where.AND = and;
  return where;
}

export async function listOrders(session: Session, filters: OrderFilters) {
  const scope = await vendorWhere(session);
  const where = orderWhere(scope, filters);
  const page = Math.max(1, filters.page ?? 1);
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include: ticketInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.order.count({ where }),
  ]);
  return { rows: rows.map(toTicket), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const detailInclude = {
  lines: { include: { category: true, subService: true } },
  tier: true,
  events: { orderBy: [{ at: "asc" }, { id: "asc" }] },
  invoice: { include: { items: { orderBy: { sortOrder: "asc" } }, conditions: true } },
  failures: { orderBy: { createdAt: "desc" } },
  rating: true,
  pickupDriver: { select: { id: true, fullName: true, phone: true } },
  deliveryDriver: { select: { id: true, fullName: true, phone: true } },
  customer: { select: { id: true, phone: true, fullName: true, _count: { select: { orders: true } } } },
  vendor: { select: { id: true, nameEn: true, nameAr: true, codFee: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

export async function orderDetail(session: Session, id: string): Promise<OrderDetail | null> {
  const scope = await vendorWhere(session);
  const order = await db.order.findFirst({ where: { id, ...scope }, include: detailInclude });
  if (!order) return null;
  return order;
}

export async function staffNamesById(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function vendorDrivers(vendorId: string) {
  const drivers = await db.mobileUser.findMany({
    where: { vendorId, role: "driver", isActive: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      isAvailable: true,
      _count: {
        select: {
          pickupTasks: { where: { status: "driverAssigned" } },
          deliveryTasks: { where: { status: "outForDelivery" } },
        },
      },
    },
  });
  return drivers.map((d) => ({
    id: d.id,
    name: d.fullName ?? d.phone,
    phone: d.phone,
    isAvailable: d.isAvailable,
    load: d._count.pickupTasks + d._count.deliveryTasks,
  }));
}

export type DriverOption = Awaited<ReturnType<typeof vendorDrivers>>[number];

/** Deliveries per driver over the last `days` days. */
export async function deliveredByDriver(scope: { vendorId?: string }, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.order.groupBy({
    by: ["deliveryDriverId"],
    where: { ...scope, status: "delivered", updatedAt: { gte: since } },
    _count: { _all: true },
  });
  return new Map(rows.map((d) => [d.deliveryDriverId, d._count._all]));
}
