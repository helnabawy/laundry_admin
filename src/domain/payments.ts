import { round2, type PaymentMethod } from "./pricing";

/**
 * Payment rules: which provider takes a method, what it keeps, and how much
 * of a payment can still be refunded. Pure — the gateway calls and ledger
 * writes live in src/server/payments.
 */

export const PAYMENT_PROVIDERS = ["networkIntl", "telr", "tabby", "cash"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** Providers that take a card. A laundry picks one (`Vendor.cardProvider`). */
export const CARD_PROVIDERS = ["networkIntl", "telr"] as const satisfies readonly PaymentProvider[];

export const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "partiallyRefunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses where the money was taken (some of it may since be refunded). */
export const CAPTURED_STATUSES: readonly PaymentStatus[] = [
  "succeeded",
  "partiallyRefunded",
  "refunded",
];

/** A pending online checkout lapses after this long. */
export const CHECKOUT_TTL_MS = 30 * 60_000;

/** Methods paid through a hosted checkout page rather than at the door. */
export function isOnline(method: PaymentMethod | null | undefined): boolean {
  return method === "card" || method === "payLater";
}

export function providerFor(
  method: PaymentMethod,
  vendor: { cardProvider: PaymentProvider },
): PaymentProvider {
  switch (method) {
    case "card":
      return vendor.cardProvider;
    case "payLater":
      return "tabby";
    case "cashOnDelivery":
      return "cash";
  }
}

export interface FeeSchedule {
  feePercent: number;
  feeFixed: number;
}

/** What the provider keeps from a successful payment of `amount`. */
export function gatewayFee(amount: number, fees: FeeSchedule): number {
  if (amount <= 0) return 0;
  return round2((amount * fees.feePercent) / 100 + fees.feeFixed);
}

/** Whether a provider with these limits accepts an order total. */
export function withinLimits(
  amount: number,
  limits: { minAmount: number | null; maxAmount: number | null },
): boolean {
  if (limits.minAmount != null && amount < limits.minAmount) return false;
  if (limits.maxAmount != null && amount > limits.maxAmount) return false;
  return true;
}

export function refundedTotal(refunds: readonly { amount: number }[]): number {
  return round2(refunds.reduce((sum, r) => sum + r.amount, 0));
}

export function refundableAmount(
  payment: { amount: number; status: PaymentStatus },
  refunds: readonly { amount: number }[],
): number {
  if (payment.status !== "succeeded" && payment.status !== "partiallyRefunded") return 0;
  return Math.max(0, round2(payment.amount - refundedTotal(refunds)));
}

/** Why `amount` can't be refunded from this payment, or null when it can. */
export function refundProblem(
  payment: { amount: number; status: PaymentStatus },
  refunds: readonly { amount: number }[],
  amount: number,
): string | null {
  if (payment.status !== "succeeded" && payment.status !== "partiallyRefunded") {
    return "Only a completed payment can be refunded";
  }
  if (!Number.isFinite(amount) || amount <= 0) return "Refund amount must be more than zero";
  if (round2(amount) !== amount) return "Refund amount can have at most 2 decimals";
  if (amount > refundableAmount(payment, refunds)) {
    return "Refund is more than what is left on this payment";
  }
  return null;
}

/** The payment's status once `refunded` (all refunds so far) has gone back. */
export function statusAfterRefund(amount: number, refunded: number): PaymentStatus {
  return round2(refunded) >= round2(amount) ? "refunded" : "partiallyRefunded";
}

export function isExpired(
  payment: { status: PaymentStatus; expiresAt: Date | null },
  now: Date,
): boolean {
  return payment.status === "pending" && payment.expiresAt != null && payment.expiresAt <= now;
}

/** Tabby splits a purchase into four equal installments (last one absorbs rounding). */
export function installments(amount: number, count = 4): number[] {
  const each = Math.floor((amount * 100) / count) / 100;
  const parts = Array.from({ length: count }, () => each);
  parts[count - 1] = round2(amount - each * (count - 1));
  return parts;
}
