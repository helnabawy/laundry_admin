/**
 * Money rules. The server is the only pricing authority — a client-supplied
 * total is never trusted (PRODUCT.md → Backend).
 *
 * Amounts are AED held as JS numbers and rounded to 2 decimals (fils) at each
 * step, which is exact for the sums this product produces.
 */

export type SurchargeType = "none" | "flat" | "percentage";
export type PaymentMethod = "card" | "cashOnDelivery";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface TierPricing {
  surchargeType: SurchargeType;
  surchargeValue: number;
}

/** Mirrors the app's `ServiceTier.surchargeFor(subtotal)`. */
export function surchargeFor(tier: TierPricing, subtotal: number): number {
  switch (tier.surchargeType) {
    case "flat":
      return round2(tier.surchargeValue);
    case "percentage":
      return round2((subtotal * tier.surchargeValue) / 100);
    default:
      return 0;
  }
}

/** Cash on delivery carries a flat handling fee; card does not. */
export function codFeeFor(
  method: PaymentMethod | null | undefined,
  vendorCodFee: number,
): number {
  return method === "cashOnDelivery" ? round2(vendorCodFee) : 0;
}

export interface PricedLine {
  quantity: number;
  unitPrice: number;
}

export function lineTotal(line: PricedLine): number {
  return round2(line.quantity * line.unitPrice);
}

export function subtotalOf(lines: readonly PricedLine[]): number {
  return round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));
}

export interface InvoiceTotals {
  subtotal: number;
  vipSurcharge: number;
  codFee: number;
  total: number;
}

export function invoiceTotals(input: {
  lines: readonly PricedLine[];
  tier: TierPricing;
  paymentMethod?: PaymentMethod | null;
  vendorCodFee: number;
}): InvoiceTotals {
  const subtotal = subtotalOf(input.lines);
  const vipSurcharge = surchargeFor(input.tier, subtotal);
  const codFee = codFeeFor(input.paymentMethod, input.vendorCodFee);
  return {
    subtotal,
    vipSurcharge,
    codFee,
    total: round2(subtotal + vipSurcharge + codFee),
  };
}
