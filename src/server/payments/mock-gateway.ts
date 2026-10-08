import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  GatewayError,
  type Checkout,
  type CheckoutRequest,
  type GatewayEvent,
  type OnlineProvider,
  type PaymentGateway,
} from "./gateway";

/**
 * Stand-in for a hosted-checkout provider. The "hosted page" is this app's
 * own `/pay/{token}`; its buttons send a signed webhook back exactly like a
 * real provider would, so the rest of the system can't tell the difference.
 */

export const SIGNATURE_HEADER = "x-mock-signature";

function secret(): string {
  const value = process.env.PAYMENT_WEBHOOK_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("PAYMENT_WEBHOOK_SECRET is not set");
  return "dev-payment-webhook-secret";
}

export function signMockPayload(rawBody: string): string {
  return createHmac("sha256", secret()).update(rawBody).digest("hex");
}

export interface MockWebhookBody {
  provider: OnlineProvider;
  reference: string;
  event: "succeeded" | "failed" | "cancelled";
  reason?: string;
  at: string;
}

const REF_PREFIX: Record<OnlineProvider, string> = {
  networkIntl: "NI",
  telr: "TLR",
  tabby: "TBY",
};

export class MockGateway implements PaymentGateway {
  constructor(readonly provider: OnlineProvider) {}

  async createCheckout(req: CheckoutRequest): Promise<Checkout> {
    const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
    return {
      providerRef: `${REF_PREFIX[this.provider]}-${randomUUID()}`,
      checkoutUrl: `${base.replace(/\/$/, "")}/pay/${req.checkoutToken}`,
    };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<GatewayEvent> {
    const given = Buffer.from(headers.get(SIGNATURE_HEADER) ?? "", "utf8");
    const expected = Buffer.from(signMockPayload(rawBody), "utf8");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new GatewayError("Invalid webhook signature");
    }
    let body: MockWebhookBody;
    try {
      body = JSON.parse(rawBody) as MockWebhookBody;
    } catch {
      throw new GatewayError("Webhook body must be JSON");
    }
    if (body.provider !== this.provider) throw new GatewayError("Webhook is for another provider");
    if (!["succeeded", "failed", "cancelled"].includes(body.event) || !body.reference) {
      throw new GatewayError("Unknown webhook event");
    }
    return {
      provider: this.provider,
      providerRef: body.reference,
      type: body.event,
      reason: body.reason,
      raw: body,
    };
  }

  async refund(req: { providerRef: string; amount: number }) {
    if (!req.providerRef) throw new GatewayError("Payment has no provider reference");
    return { refundRef: `${REF_PREFIX[this.provider]}-RF-${randomUUID()}` };
  }
}
