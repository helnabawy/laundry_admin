import { describe, expect, it } from "vitest";
import {
  gatewayFee,
  installments,
  isExpired,
  isOnline,
  providerFor,
  refundableAmount,
  refundProblem,
  statusAfterRefund,
  withinLimits,
} from "@/domain/payments";
import { pnl } from "@/domain/finance";

describe("payments", () => {
  it("routes each method to its provider", () => {
    expect(providerFor("card", { cardProvider: "telr" })).toBe("telr");
    expect(providerFor("card", { cardProvider: "networkIntl" })).toBe("networkIntl");
    expect(providerFor("payLater", { cardProvider: "telr" })).toBe("tabby");
    expect(providerFor("cashOnDelivery", { cardProvider: "telr" })).toBe("cash");
    expect(isOnline("card")).toBe(true);
    expect(isOnline("payLater")).toBe(true);
    expect(isOnline("cashOnDelivery")).toBe(false);
    expect(isOnline(null)).toBe(false);
  });

  it("gateway fee is percent + fixed, rounded to fils", () => {
    expect(gatewayFee(100, { feePercent: 2.5, feeFixed: 1 })).toBe(3.5);
    expect(gatewayFee(33.33, { feePercent: 2.8, feeFixed: 1 })).toBe(1.93);
    expect(gatewayFee(80, { feePercent: 0, feeFixed: 0 })).toBe(0);
    expect(gatewayFee(0, { feePercent: 2.5, feeFixed: 1 })).toBe(0);
  });

  it("provider limits", () => {
    expect(withinLimits(49.99, { minAmount: 50, maxAmount: 5000 })).toBe(false);
    expect(withinLimits(50, { minAmount: 50, maxAmount: 5000 })).toBe(true);
    expect(withinLimits(5000.01, { minAmount: 50, maxAmount: 5000 })).toBe(false);
    expect(withinLimits(1, { minAmount: null, maxAmount: null })).toBe(true);
  });

  it("refundable balance shrinks with each refund", () => {
    const paid = { amount: 100, status: "succeeded" as const };
    expect(refundableAmount(paid, [])).toBe(100);
    expect(refundableAmount(paid, [{ amount: 30 }, { amount: 20.5 }])).toBe(49.5);
    expect(refundableAmount({ amount: 100, status: "pending" }, [])).toBe(0);
    expect(refundableAmount({ amount: 100, status: "refunded" }, [{ amount: 100 }])).toBe(0);
  });

  it("rejects bad refunds", () => {
    const paid = { amount: 100, status: "succeeded" as const };
    expect(refundProblem(paid, [], 100)).toBeNull();
    expect(refundProblem(paid, [{ amount: 60 }], 40)).toBeNull();
    expect(refundProblem(paid, [{ amount: 60 }], 40.01)).toMatch(/more than/);
    expect(refundProblem(paid, [], 0)).toMatch(/more than zero/);
    expect(refundProblem(paid, [], -5)).toMatch(/more than zero/);
    expect(refundProblem(paid, [], 10.005)).toMatch(/2 decimals/);
    expect(refundProblem({ amount: 100, status: "failed" }, [], 10)).toMatch(/completed/);
    expect(refundProblem({ amount: 100, status: "partiallyRefunded" }, [{ amount: 10 }], 90)).toBeNull();
  });

  it("status after refund", () => {
    expect(statusAfterRefund(100, 30)).toBe("partiallyRefunded");
    expect(statusAfterRefund(100, 100)).toBe("refunded");
    expect(statusAfterRefund(0.3, 0.1 + 0.2)).toBe("refunded");
  });

  it("only pending checkouts expire", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const past = new Date("2026-10-09T09:59:59Z");
    expect(isExpired({ status: "pending", expiresAt: past }, now)).toBe(true);
    expect(isExpired({ status: "pending", expiresAt: now }, now)).toBe(true);
    expect(isExpired({ status: "pending", expiresAt: new Date("2026-10-09T10:00:01Z") }, now)).toBe(false);
    expect(isExpired({ status: "succeeded", expiresAt: past }, now)).toBe(false);
    expect(isExpired({ status: "pending", expiresAt: null }, now)).toBe(false);
  });

  it("splits pay-later into four installments that add up", () => {
    expect(installments(100)).toEqual([25, 25, 25, 25]);
    const parts = installments(100.01);
    expect(parts).toEqual([25, 25, 25, 25.01]);
    expect(installments(10.1).reduce((a, b) => a + b, 0)).toBeCloseTo(10.1, 10);
  });
});

describe("profit and loss", () => {
  it("net revenue, profit and margin", () => {
    expect(pnl({ gross: 1000, refunds: 50, fees: 30.5, expenses: 400 })).toEqual({
      gross: 1000,
      refunds: 50,
      fees: 30.5,
      expenses: 400,
      netRevenue: 950,
      profit: 519.5,
      margin: 519.5 / 950,
    });
  });

  it("a loss is negative and margin is null without revenue", () => {
    const loss = pnl({ gross: 0, refunds: 0, fees: 0, expenses: 120 });
    expect(loss.profit).toBe(-120);
    expect(loss.margin).toBeNull();
  });
});
