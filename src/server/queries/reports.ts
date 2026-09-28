import "server-only";
import { db } from "@/server/db";
import { ORDER_STATUSES, type OrderKind, type OrderStatus } from "@/domain/order-workflow";
import { localMinuteToInstant, isIsoDate, localDateOf } from "@/domain/slots";
import { invoiceTotal, orderWhere } from "./orders";

/** Report filters, parsed from URL search params (shared by page and export). */
export interface ReportFilters {
  from: string;
  to: string;
  vendorId?: string;
  status?: OrderStatus | "active" | "done";
  kind?: OrderKind;
  paymentMethod?: "card" | "cashOnDelivery" | "none";
  paid?: boolean;
  tierId?: string;
  driverId?: string;
  categoryId?: string;
  q?: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseReportFilters(params: Params): ReportFilters {
  const today = localDateOf(new Date());
  const monthAgo = localDateOf(new Date(Date.now() - 29 * 86_400_000));
  const from = one(params.from);
  const to = one(params.to);
  const status = one(params.status);
  const kind = one(params.kind);
  const payment = one(params.payment);
  const paid = one(params.paid);
  return {
    from: from && isIsoDate(from) ? from : monthAgo,
    to: to && isIsoDate(to) ? to : today,
    vendorId: one(params.vendor),
    status:
      status === "active" || status === "done" || ORDER_STATUSES.includes(status as OrderStatus)
        ? (status as ReportFilters["status"])
        : undefined,
    kind: kind === "SHOP" || kind === "WIZARD" ? kind : undefined,
    paymentMethod: payment === "card" || payment === "cashOnDelivery" || payment === "none" ? payment : undefined,
    paid: paid === "yes" ? true : paid === "no" ? false : undefined,
    tierId: one(params.tier),
    driverId: one(params.driver),
    categoryId: one(params.category),
    q: one(params.q),
  };
}

export function reportQueryString(f: ReportFilters, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  sp.set("from", f.from);
  sp.set("to", f.to);
  if (f.vendorId) sp.set("vendor", f.vendorId);
  if (f.status) sp.set("status", f.status);
  if (f.kind) sp.set("kind", f.kind);
  if (f.paymentMethod) sp.set("payment", f.paymentMethod);
  if (f.paid !== undefined) sp.set("paid", f.paid ? "yes" : "no");
  if (f.tierId) sp.set("tier", f.tierId);
  if (f.driverId) sp.set("driver", f.driverId);
  if (f.categoryId) sp.set("category", f.categoryId);
  if (f.q) sp.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

function where(f: ReportFilters) {
  return orderWhere(f.vendorId ? { vendorId: f.vendorId } : {}, {
    q: f.q,
    status: f.status,
    kind: f.kind,
    from: localMinuteToInstant(f.from, 0),
    to: localMinuteToInstant(f.to, 24 * 60),
    tierId: f.tierId,
    driverId: f.driverId,
    paymentMethod: f.paymentMethod,
    paid: f.paid,
    categoryId: f.categoryId,
  });
}

const reportInclude = {
  vendor: { select: { nameEn: true, nameAr: true } },
  tier: { select: { nameEn: true, nameAr: true } },
  pickupDriver: { select: { fullName: true } },
  deliveryDriver: { select: { fullName: true } },
  invoice: { include: { items: { select: { quantity: true, unitPrice: true } } } },
  failures: { select: { stage: true, reason: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  rating: { select: { stars: true } },
};

export interface ReportRow {
  id: string;
  number: number;
  createdAt: Date;
  vendor: { en: string; ar: string };
  kind: OrderKind;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  tier: { en: string; ar: string };
  pickupDriver: string | null;
  deliveryDriver: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  paid: boolean | null;
  total: number | null;
  failure: string | null;
  rating: number | null;
}

function toRow(o: Awaited<ReturnType<typeof fetchRows>>[number]): ReportRow {
  return {
    id: o.id,
    number: o.number,
    createdAt: o.createdAt,
    vendor: { en: o.vendor.nameEn, ar: o.vendor.nameAr },
    kind: o.kind,
    status: o.status,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    tier: { en: o.tier.nameEn, ar: o.tier.nameAr },
    pickupDriver: o.pickupDriver?.fullName ?? null,
    deliveryDriver: o.deliveryDriver?.fullName ?? null,
    invoiceNumber: o.invoice?.number ?? null,
    paymentMethod: o.invoice?.paymentMethod ?? null,
    paid: o.invoice ? o.invoice.paid : null,
    total: o.invoice ? invoiceTotal(o.invoice) : null,
    failure: o.failures[0] ? `${o.failures[0].stage}:${o.failures[0].reason}` : null,
    rating: o.rating?.stars ?? null,
  };
}

function fetchRows(f: ReportFilters, opts: { skip?: number; take?: number }) {
  return db.order.findMany({ where: where(f), include: reportInclude, orderBy: { createdAt: "desc" }, ...opts });
}

export const REPORT_PAGE_SIZE = 50;
export const EXPORT_LIMIT = 50_000;

export async function reportPage(f: ReportFilters, page: number) {
  const [rows, total] = await Promise.all([
    fetchRows(f, { skip: (page - 1) * REPORT_PAGE_SIZE, take: REPORT_PAGE_SIZE }),
    db.order.count({ where: where(f) }),
  ]);
  return { rows: rows.map(toRow), total, pages: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)) };
}

export async function reportExportRows(f: ReportFilters) {
  return (await fetchRows(f, { take: EXPORT_LIMIT })).map(toRow);
}

export async function reportSummary(f: ReportFilters) {
  const rows = await db.order.findMany({
    where: where(f),
    select: { status: true, invoice: { include: { items: { select: { quantity: true, unitPrice: true } } } } },
  });
  let invoiced = 0;
  let collected = 0;
  let delivered = 0;
  let failedOrCancelled = 0;
  for (const r of rows) {
    if (r.status === "delivered") delivered++;
    if (r.status === "cancelled" || r.status === "pickupFailed" || r.status === "deliveryFailed") failedOrCancelled++;
    if (r.invoice && r.status !== "cancelled") {
      const total = invoiceTotal(r.invoice);
      invoiced += total;
      if (r.invoice.paid) collected += total;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    orders: rows.length,
    delivered,
    failedOrCancelled,
    invoiced: round(invoiced),
    collected: round(collected),
    outstanding: round(invoiced - collected),
  };
}

export async function reportFilterOptions() {
  const [vendors, tiers, drivers, categories] = await Promise.all([
    db.vendor.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    db.serviceTier.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    db.mobileUser.findMany({ where: { role: "driver" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, phone: true } }),
    db.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  return { vendors, tiers, drivers, categories };
}
