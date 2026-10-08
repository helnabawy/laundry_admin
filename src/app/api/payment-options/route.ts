import { db } from "@/server/db";
import { requestVendor } from "@/server/auth/scope";
import { handle, ok } from "@/server/api/http";

/**
 * How a customer can pay this laundry. The app shows only these; the order
 * total decides whether pay-later fits its min/max.
 */
export const GET = handle(async (req) => {
  const vendor = await requestVendor(req);
  const gateways = await db.vendorGateway.findMany({ where: { vendorId: vendor.id } });
  const byProvider = new Map(gateways.map((g) => [g.provider, g]));
  const enabled = (provider: string) => byProvider.get(provider as never)?.isEnabled ?? true;
  const limit = (v: unknown) => (v == null ? null : Number(v));

  const options = [];
  if (enabled(vendor.cardProvider)) {
    options.push({ method: "card", provider: vendor.cardProvider, fee: 0, minAmount: null, maxAmount: null });
  }
  const tabby = byProvider.get("tabby");
  if (enabled("tabby")) {
    options.push({
      method: "payLater",
      provider: "tabby",
      fee: 0,
      installments: 4,
      minAmount: limit(tabby?.minAmount),
      maxAmount: limit(tabby?.maxAmount),
    });
  }
  if (enabled("cash")) {
    options.push({ method: "cashOnDelivery", provider: "cash", fee: Number(vendor.codFee), minAmount: null, maxAmount: null });
  }
  return ok(options);
});
