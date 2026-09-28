import { describe, expect, it } from "vitest";
import { codFeeFor, invoiceTotals, round2, surchargeFor } from "@/domain/pricing";

describe("pricing", () => {
  it("VIP percentage surcharge is applied to the subtotal", () => {
    expect(surchargeFor({ surchargeType: "percentage", surchargeValue: 15 }, 100)).toBe(15);
    expect(surchargeFor({ surchargeType: "percentage", surchargeValue: 15 }, 33)).toBe(4.95);
  });

  it("flat and none surcharges", () => {
    expect(surchargeFor({ surchargeType: "flat", surchargeValue: 10 }, 999)).toBe(10);
    expect(surchargeFor({ surchargeType: "none", surchargeValue: 10 }, 999)).toBe(0);
  });

  it("COD fee only for cash on delivery", () => {
    expect(codFeeFor("cashOnDelivery", 5)).toBe(5);
    expect(codFeeFor("card", 5)).toBe(0);
    expect(codFeeFor(null, 5)).toBe(0);
  });

  it("totals add subtotal, VIP surcharge and COD fee", () => {
    const totals = invoiceTotals({
      lines: [
        { quantity: 3, unitPrice: 2 },
        { quantity: 1, unitPrice: 45 },
      ],
      tier: { surchargeType: "percentage", surchargeValue: 15 },
      paymentMethod: "cashOnDelivery",
      vendorCodFee: 5,
    });
    expect(totals).toEqual({ subtotal: 51, vipSurcharge: 7.65, codFee: 5, total: 63.65 });
  });

  it("rounds to fils", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});
