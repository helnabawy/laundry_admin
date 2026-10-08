import "server-only";
import type { PaymentProvider } from "@/domain/payments";
import { MockGateway } from "./mock-gateway";

/**
 * What the app needs from a payment provider (Network International, Telr,
 * Tabby…). Today every provider is the mock below; going live means one
 * implementation of this interface per provider, picked in `gatewayFor`.
 */

export type OnlineProvider = Exclude<PaymentProvider, "cash">;

export interface CheckoutRequest {
  paymentId: string;
  checkoutToken: string;
  amount: number;
  currency: string;
  orderNumber: number;
  customer: { name: string; phone: string };
}

export interface Checkout {
  providerRef: string;
  checkoutUrl: string;
}

/** A provider's notification about a payment, already verified. */
export interface GatewayEvent {
  provider: OnlineProvider;
  providerRef: string;
  type: "succeeded" | "failed" | "cancelled";
  reason?: string;
  raw: unknown;
}

export interface PaymentGateway {
  readonly provider: OnlineProvider;
  createCheckout(req: CheckoutRequest): Promise<Checkout>;
  /** Checks the signature on a webhook and parses it. Throws if invalid. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<GatewayEvent>;
  refund(req: { providerRef: string; amount: number }): Promise<{ refundRef: string }>;
}

export class GatewayError extends Error {}

const cache = new Map<OnlineProvider, PaymentGateway>();

export function gatewayFor(provider: OnlineProvider): PaymentGateway {
  const mode = process.env.PAYMENT_MODE ?? "mock";
  if (mode !== "mock") throw new Error(`PAYMENT_MODE=${mode} is not supported yet`);
  let gateway = cache.get(provider);
  if (!gateway) {
    gateway = new MockGateway(provider);
    cache.set(provider, gateway);
  }
  return gateway;
}
