import { defaultVendor } from "@/server/auth/scope";
import { badRequest, handle, ok } from "@/server/api/http";
import { slot } from "@/server/api/serializers";
import { slotsFor } from "@/server/slots";
import { isIsoDate } from "@/domain/slots";

// GET /api/timeslots?date=YYYY-MM-DD&tier=<tierId>&type=pickup|delivery[&notBefore=ISO]
export const GET = handle(async (req) => {
  const params = req.nextUrl.searchParams;
  const date = params.get("date") ?? "";
  if (!isIsoDate(date)) throw badRequest("date must be YYYY-MM-DD");
  const type = params.get("type") === "delivery" ? "delivery" : "pickup";
  const notBeforeRaw = params.get("notBefore");
  // A timestamp without an offset (Dart's local `toIso8601String()`) is UAE
  // local time, not the server's zone.
  const hasOffset = notBeforeRaw ? /(Z|[+-]\d{2}:?\d{2})$/i.test(notBeforeRaw) : true;
  const notBefore = notBeforeRaw ? new Date(hasOffset ? notBeforeRaw : `${notBeforeRaw}+04:00`) : undefined;
  if (notBefore && Number.isNaN(notBefore.getTime())) throw badRequest("notBefore must be an ISO date");

  const vendor = await defaultVendor();
  const slots = await slotsFor({ vendorId: vendor.id, date, type, notBefore });
  return ok(slots.map(slot));
});
