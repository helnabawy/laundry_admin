import { handle, notFound, ok, problem } from "@/server/api/http";
import { gatewayFor, GatewayError, type OnlineProvider } from "@/server/payments/gateway";
import { handleGatewayEvent } from "@/server/payments/service";

const PROVIDERS = new Set<OnlineProvider>(["networkIntl", "telr", "tabby"]);

/**
 * Server-to-server notifications from a payment provider. The signature is
 * checked before anything is read; replays are harmless (idempotent).
 */
export const POST = handle(async (req, ctx: RouteContext<"/api/payments/webhooks/[provider]">) => {
  const { provider } = await ctx.params;
  if (!PROVIDERS.has(provider as OnlineProvider)) throw notFound("Unknown provider");
  const raw = await req.text();
  let event;
  try {
    event = await gatewayFor(provider as OnlineProvider).verifyWebhook(raw, req.headers);
  } catch (error) {
    if (error instanceof GatewayError) return problem(401, error.message);
    throw error;
  }
  const outcome = await handleGatewayEvent(event);
  return ok({ received: true, outcome });
});
