"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { gatewayFor, type OnlineProvider } from "@/server/payments/gateway";
import { SIGNATURE_HEADER, signMockPayload, type MockWebhookBody } from "@/server/payments/mock-gateway";
import { handleGatewayEvent } from "@/server/payments/service";

const OUTCOMES = new Set(["succeeded", "failed", "cancelled"]);

/**
 * The mock hosted page's buttons. Builds the same signed webhook a provider
 * would send and runs it through the real verification + handler.
 */
export async function completeMockCheckout(token: string, formData: FormData) {
  const outcome = String(formData.get("outcome") ?? "");
  if (!OUTCOMES.has(outcome)) redirect(`/pay/${token}`);
  const payment = await db.payment.findUnique({ where: { checkoutToken: token } });
  if (payment && payment.status === "pending" && payment.providerRef && payment.provider !== "cash") {
    const body: MockWebhookBody = {
      provider: payment.provider as OnlineProvider,
      reference: payment.providerRef,
      event: outcome as MockWebhookBody["event"],
      reason: outcome === "failed" ? "Card declined by issuer (test)" : undefined,
      at: new Date().toISOString(),
    };
    const raw = JSON.stringify(body);
    const headers = new Headers({ [SIGNATURE_HEADER]: signMockPayload(raw) });
    const event = await gatewayFor(body.provider).verifyWebhook(raw, headers);
    await handleGatewayEvent(event);
  }
  redirect(`/pay/${token}`);
}
