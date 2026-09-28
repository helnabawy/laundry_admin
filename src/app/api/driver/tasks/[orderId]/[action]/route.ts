import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, handle, langOf, mobileDriver, notFound, ok, readJson } from "@/server/api/http";
import { order, orderInclude } from "@/server/api/serializers";
import {
  confirmDelivery,
  confirmPickup,
  reportDeliveryFailed,
  reportPickupFailed,
} from "@/server/orders/mobile";
import { storeImage, UploadError } from "@/server/storage";

const reason = z.enum(["customerAbsent", "wrongAddress", "customerRescheduled", "other"]).catch("other");

async function form(req: Request) {
  try {
    return await req.formData();
  } catch {
    throw badRequest("Expected multipart/form-data");
  }
}

async function photo(value: FormDataEntryValue | null, required: boolean) {
  if (!value || (value instanceof File && value.size === 0)) {
    if (required) throw badRequest("A photo of the stop is required");
    return null;
  }
  try {
    return await storeImage(value, "driver");
  } catch (e) {
    if (e instanceof UploadError) throw badRequest(e.message);
    throw e;
  }
}

// POST /api/driver/tasks/{orderId}/{confirm-pickup|report-pickup-failed|confirm-delivery|report-delivery-failed}
export const POST = handle(async (req, ctx: RouteContext<"/api/driver/tasks/[orderId]/[action]">) => {
  const me = await mobileDriver(req);
  const { orderId, action } = await ctx.params;

  switch (action) {
    case "confirm-pickup":
      await confirmPickup(me.id, orderId);
      break;
    case "report-pickup-failed": {
      const data = await form(req);
      await reportPickupFailed(me.id, orderId, {
        reason: reason.parse(data.get("reason")),
        note: (data.get("note") as string | null) || null,
        photoUrl: (await photo(data.get("photo"), true))!,
      });
      break;
    }
    case "confirm-delivery": {
      const data = await form(req);
      await confirmDelivery(me.id, orderId, {
        cashCollected: String(data.get("cashCollected")) === "true",
        photoUrl: await photo(data.get("photo"), false),
      });
      break;
    }
    case "report-delivery-failed": {
      const body = await readJson(req, z.object({ reason, note: z.string().max(1000).nullish() }));
      await reportDeliveryFailed(me.id, orderId, { reason: body.reason, note: body.note });
      break;
    }
    default:
      throw notFound("Unknown action");
  }

  const row = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  return ok(order(langOf(req), row));
});
