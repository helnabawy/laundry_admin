import { round2 } from "./pricing";

/**
 * The owner's profit and loss. Cash basis: revenue counts when a payment
 * succeeds (`Payment.paidAt`), a refund when it is issued. A provider keeps
 * its fee on a refunded payment, so fees are never reversed.
 *
 * VAT is not modelled: amounts are what the customer paid.
 */

export interface PnlInput {
  /** Payments taken (card, pay-later and cash). */
  gross: number;
  refunds: number;
  /** What the payment providers kept. */
  fees: number;
  expenses: number;
}

export interface Pnl extends PnlInput {
  netRevenue: number;
  profit: number;
  /** Profit as a share of net revenue, 0–1; null when there is no revenue. */
  margin: number | null;
}

export function pnl(input: PnlInput): Pnl {
  const netRevenue = round2(input.gross - input.refunds);
  const profit = round2(netRevenue - input.fees - input.expenses);
  return {
    gross: round2(input.gross),
    refunds: round2(input.refunds),
    fees: round2(input.fees),
    expenses: round2(input.expenses),
    netRevenue,
    profit,
    margin: netRevenue > 0 ? profit / netRevenue : null,
  };
}

export const EXPENSE_CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "supplies",
  "fuel",
  "maintenance",
  "marketing",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
