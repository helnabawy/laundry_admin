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
  const notBefore = notBeforeRaw ? new Date(notBeforeRaw) : undefined;
  if (notBefore && Number.isNaN(notBefore.getTime())) throw badRequest("notBefore must be an ISO date");

  const vendor = await defaultVendor();
  const slots = await slotsFor({ vendorId: vendor.id, date, type, notBefore });
  return ok(slots.map(slot));
});
