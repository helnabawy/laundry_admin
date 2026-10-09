import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { vendorSql, vendorWhere } from "@/server/auth/scope";
import type { Session } from "@/server/auth/session";
import { pnl, EXPENSE_CATEGORIES, type ExpenseCategory, type Pnl } from "@/domain/finance";
import {
  CAPTURED_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  type PaymentProvider,
  type PaymentStatus,
} from "@/domain/payments";
import { round2, type PaymentMethod } from "@/domain/pricing";
import { isIsoDate, localDateOf, localMinuteToInstant } from "@/domain/slots";

/**
 * The owner's money, read from the payment ledger and the expense book.
 * Cash basis (see src/domain/finance.ts): a payment counts on the local day
 * it succeeded, a refund on the day it was issued, an expense on its day.
 */

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export interface FinanceRange {
  from: string;
  to: string;
}

export const RANGE_PRESETS = [7, 30, 90] as const;

/** `?from=&to=` (local dates) or `?range=7|30|90`; defaults to the last 30 days. */
export function parseFinanceRange(params: Params): FinanceRange & { preset: number | null } {
  const today = localDateOf(new Date());
  const from = one(params.from);
  const to = one(params.to);
  if (from && to && isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { from, to, preset: null };
  }
  const days = Number(one(params.range));
  const preset = (RANGE_PRESETS as readonly number[]).includes(days) ? days : 30;
  return { from: localDateOf(new Date(Date.now() - (preset - 1) * 86_400_000)), to: today, preset };
}

/** [start, end) instants covering the local dates `from`..`to` inclusive. */
export function rangeInstants(r: FinanceRange) {
  const start = localMinuteToInstant(r.from, 0);
  const end = new Date(localMinuteToInstant(r.to, 0).getTime() + 86_400_000);
  return { start, end };
}

/** The days `from`..`to`, as local dates. */
function daysOf(r: FinanceRange): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${r.from}T12:00:00Z`); t <= Date.parse(`${r.to}T12:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export interface FinanceDay {
  date: string;
  gross: number;
  refunds: number;
  netRevenue: number;
  fees: number;
  expenses: number;
  profit: number;
}

export interface FinanceData {
  range: FinanceRange;
  pnl: Pnl;
  payments: number;
  /** Unpaid invoices on orders that are still going ahead. */
  outstanding: { amount: number; count: number };
  /** Online checkouts opened but not completed yet. */
  pendingOnline: { amount: number; count: number };
  perDay: FinanceDay[];
  byProvider: { provider: PaymentProvider; method: PaymentMethod; gross: number; fees: number; count: number }[];
  byCategory: { category: ExpenseCategory; amount: number }[];
}

const capturedSql = Prisma.join(CAPTURED_STATUSES.map((s) => Prisma.sql`${s}::"PaymentStatus"`));

export async function financeData(session: Session, range: FinanceRange): Promise<FinanceData> {
  const { start, end } = rangeInstants(range);
  const scope = await vendorWhere(session);
  const [paySql, refundSql, expenseSql, orderSql] = await Promise.all([
    vendorSql(session, Prisma.sql`p."vendorId"`),
    vendorSql(session, Prisma.sql`r."vendorId"`),
    vendorSql(session, Prisma.sql`e."vendorId"`),
    vendorSql(session, Prisma.sql`o."vendorId"`),
  ]);

  const [paidDays, refundDays, expenseDays, providers, categories, outstanding, pending] = await Promise.all([
    db.$queryRaw<{ day: string; gross: number; fees: number; n: bigint }[]>`
      SELECT to_char(p."paidAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day,
             SUM(p.amount)::float AS gross, SUM(p."feeAmount")::float AS fees, COUNT(*) AS n
      FROM "Payment" p
      WHERE p.status IN (${capturedSql}) AND p."paidAt" >= ${start} AND p."paidAt" < ${end} ${paySql}
      GROUP BY 1`,
    db.$queryRaw<{ day: string; amount: number }[]>`
      SELECT to_char(r."createdAt" AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, SUM(r.amount)::float AS amount
      FROM "Refund" r
      WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end} ${refundSql}
      GROUP BY 1`,
    db.$queryRaw<{ day: string; amount: number }[]>`
      SELECT to_char(e."incurredOn", 'YYYY-MM-DD') AS day, SUM(e.amount)::float AS amount
      FROM "Expense" e
      WHERE e."deletedAt" IS NULL AND e."incurredOn" >= ${range.from}::date AND e."incurredOn" <= ${range.to}::date ${expenseSql}
      GROUP BY 1`,
    db.$queryRaw<{ provider: PaymentProvider; method: PaymentMethod; gross: number; fees: number; n: bigint }[]>`
      SELECT p.provider::text AS provider, p.method::text AS method,
             SUM(p.amount)::float AS gross, SUM(p."feeAmount")::float AS fees, COUNT(*) AS n
      FROM "Payment" p
      WHERE p.status IN (${capturedSql}) AND p."paidAt" >= ${start} AND p."paidAt" < ${end} ${paySql}
      GROUP BY 1, 2 ORDER BY 3 DESC`,
    db.$queryRaw<{ category: ExpenseCategory; amount: number }[]>`
      SELECT e.category::text AS category, SUM(e.amount)::float AS amount
      FROM "Expense" e
      WHERE e."deletedAt" IS NULL AND e."incurredOn" >= ${range.from}::date AND e."incurredOn" <= ${range.to}::date ${expenseSql}
      GROUP BY 1 ORDER BY 2 DESC`,
    // Everything owed now, regardless of the range: it's a balance, not a flow.
    db.$queryRaw<{ amount: number | null; n: bigint }[]>`
      SELECT SUM(t.total)::float AS amount, COUNT(*) AS n FROM (
        SELECT COALESCE((SELECT SUM(it.quantity * it."unitPrice") FROM "InvoiceItem" it WHERE it."invoiceId" = i.id), 0)
               + i."vipSurcharge" + i."codFee" AS total
        FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId"
        WHERE NOT i.paid AND o.status NOT IN ('cancelled', 'pickupFailed') ${orderSql}) t`,
    db.payment.aggregate({
      where: { ...scope, status: "pending", expiresAt: { gt: new Date() } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const perDay = new Map(
    daysOf(range).map((d) => [d, { date: d, gross: 0, refunds: 0, netRevenue: 0, fees: 0, expenses: 0, profit: 0 }]),
  );
  for (const r of paidDays) {
    const row = perDay.get(r.day);
    if (row) Object.assign(row, { gross: round2(r.gross), fees: round2(r.fees) });
  }
  for (const r of refundDays) {
    const row = perDay.get(r.day);
    if (row) row.refunds = round2(r.amount);
  }
  for (const r of expenseDays) {
    const row = perDay.get(r.day);
    if (row) row.expenses = round2(r.amount);
  }
  for (const row of perDay.values()) {
    const p = pnl(row);
    row.netRevenue = p.netRevenue;
    row.profit = p.profit;
  }
  const days = [...perDay.values()];
  const sum = (k: keyof Omit<FinanceDay, "date">) => days.reduce((s, d) => s + d[k], 0);

  return {
    range,
    pnl: pnl({ gross: sum("gross"), refunds: sum("refunds"), fees: sum("fees"), expenses: sum("expenses") }),
    payments: paidDays.reduce((s, r) => s + Number(r.n), 0),
    outstanding: { amount: round2(outstanding[0]?.amount ?? 0), count: Number(outstanding[0]?.n ?? 0) },
    pendingOnline: { amount: round2(Number(pending._sum.amount ?? 0)), count: pending._count._all },
    perDay: days,
    byProvider: providers.map((r) => ({
      provider: r.provider,
      method: r.method,
      gross: round2(r.gross),
      fees: round2(r.fees),
      count: Number(r.n),
    })),
    byCategory: categories.map((r) => ({ category: r.category, amount: round2(r.amount) })),
  };
}

// ---- Payments ledger ---------------------------------------------------------------

export interface LedgerFilters extends FinanceRange {
  provider?: PaymentProvider;
  status?: PaymentStatus;
}

export function parseLedgerFilters(params: Params): LedgerFilters {
  const range = parseFinanceRange(params);
  const provider = one(params.provider);
  const status = one(params.status);
  return {
    from: range.from,
    to: range.to,
    provider: PAYMENT_PROVIDERS.includes(provider as PaymentProvider) ? (provider as PaymentProvider) : undefined,
    status: PAYMENT_STATUSES.includes(status as PaymentStatus) ? (status as PaymentStatus) : undefined,
  };
}

export interface LedgerRow {
  id: string;
  createdAt: Date;
  paidAt: Date | null;
  orderId: string;
  orderNumber: number;
  customerName: string;
  vendor: { nameEn: string; nameAr: string };
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  fee: number;
  refunded: number;
  net: number;
  reference: string | null;
  failureReason: string | null;
}

const LEDGER_PAGE = 50;

async function ledgerWhere(session: Session, f: LedgerFilters): Promise<Prisma.PaymentWhereInput> {
  const { start, end } = rangeInstants(f);
  return {
    ...(await vendorWhere(session)),
    createdAt: { gte: start, lt: end },
    provider: f.provider,
    status: f.status,
  };
}

function toLedgerRow(p: Prisma.PaymentGetPayload<{ include: typeof ledgerInclude }>): LedgerRow {
  const refunded = round2(p.refunds.reduce((s, r) => s + Number(r.amount), 0));
  const captured = CAPTURED_STATUSES.includes(p.status as PaymentStatus);
  const amount = Number(p.amount);
  const fee = Number(p.feeAmount);
  return {
    id: p.id,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    orderId: p.orderId,
    orderNumber: p.order.number,
    customerName: p.order.customerName,
    vendor: p.vendor,
    provider: p.provider as PaymentProvider,
    method: p.method as PaymentMethod,
    status: p.status as PaymentStatus,
    amount,
    fee,
    refunded,
    net: captured ? round2(amount - refunded - fee) : 0,
    reference: p.providerRef,
    failureReason: p.failureReason,
  };
}

const ledgerInclude = {
  order: { select: { number: true, customerName: true } },
  vendor: { select: { nameEn: true, nameAr: true } },
  refunds: { select: { amount: true } },
} satisfies Prisma.PaymentInclude;

export async function paymentLedger(session: Session, f: LedgerFilters, page: number) {
  const where = await ledgerWhere(session, f);
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: ledgerInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LEDGER_PAGE,
      take: LEDGER_PAGE,
    }),
    db.payment.count({ where }),
  ]);
  return { rows: rows.map(toLedgerRow), total, pages: Math.max(1, Math.ceil(total / LEDGER_PAGE)) };
}

export async function paymentLedgerExport(session: Session, f: LedgerFilters) {
  const rows = await db.payment.findMany({
    where: await ledgerWhere(session, f),
    include: ledgerInclude,
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  return rows.map(toLedgerRow);
}

// ---- Expenses --------------------------------------------------------------------

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amount: number;
  incurredOn: string;
  description: string;
  vendor: { nameEn: string; nameAr: string };
  createdBy: string | null;
}

export async function listExpenses(session: Session, f: FinanceRange & { category?: ExpenseCategory }) {
  const rows = await db.expense.findMany({
    where: {
      ...(await vendorWhere(session)),
      deletedAt: null,
      category: f.category,
      incurredOn: { gte: new Date(`${f.from}T00:00:00Z`), lte: new Date(`${f.to}T00:00:00Z`) },
    },
    include: { vendor: { select: { nameEn: true, nameAr: true } } },
    orderBy: [{ incurredOn: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  const staff = await db.staffUser.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return rows.map(
    (e): ExpenseRow => ({
      id: e.id,
      category: e.category as ExpenseCategory,
      amount: Number(e.amount),
      incurredOn: e.incurredOn.toISOString().slice(0, 10),
      description: e.description,
      vendor: e.vendor,
      createdBy: e.createdById ? (names.get(e.createdById) ?? null) : null,
    }),
  );
}

export function parseExpenseCategory(v: string | string[] | undefined): ExpenseCategory | undefined {
  const value = one(v);
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory) ? (value as ExpenseCategory) : undefined;
}

// ---- Gateway settings --------------------------------------------------------------

export interface GatewaySettingsView {
  vendorId: string;
  cardProvider: PaymentProvider;
  gateways: {
    provider: PaymentProvider;
    isEnabled: boolean;
    feePercent: number;
    feeFixed: number;
    minAmount: number | null;
    maxAmount: number | null;
  }[];
}

export async function gatewaySettings(vendorId: string): Promise<GatewaySettingsView> {
  const [vendor, rows] = await Promise.all([
    db.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { cardProvider: true } }),
    db.vendorGateway.findMany({ where: { vendorId } }),
  ]);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return {
    vendorId,
    cardProvider: vendor.cardProvider as PaymentProvider,
    gateways: PAYMENT_PROVIDERS.map((provider) => {
      const r = byProvider.get(provider);
      return {
        provider,
        isEnabled: r?.isEnabled ?? true,
        feePercent: Number(r?.feePercent ?? 0),
        feeFixed: Number(r?.feeFixed ?? 0),
        minAmount: r?.minAmount == null ? null : Number(r.minAmount),
        maxAmount: r?.maxAmount == null ? null : Number(r.maxAmount),
      };
    }),
  };
}

/** Payments (with refunds) on one order, for the order page. */
export async function orderPayments(orderId: string) {
  const rows = await db.payment.findMany({
    where: { orderId },
    include: { refunds: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const staffIds = [...new Set(rows.flatMap((p) => p.refunds.map((r) => r.createdById)).filter((x): x is string => !!x))];
  const staff = await db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } });
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return rows.map((p) => {
    const refunds = p.refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      createdAt: r.createdAt,
      by: r.createdById ? (names.get(r.createdById) ?? null) : null,
    }));
    const refunded = round2(refunds.reduce((s, r) => s + r.amount, 0));
    const amount = Number(p.amount);
    const captured = p.status === "succeeded" || p.status === "partiallyRefunded";
    return {
      id: p.id,
      provider: p.provider as PaymentProvider,
      method: p.method as PaymentMethod,
      status: p.status as PaymentStatus,
      amount,
      fee: Number(p.feeAmount),
      reference: p.providerRef,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      refunds,
      refunded,
      refundable: captured ? round2(amount - refunded) : 0,
    };
  });
}

export type OrderPaymentView = Awaited<ReturnType<typeof orderPayments>>[number];
