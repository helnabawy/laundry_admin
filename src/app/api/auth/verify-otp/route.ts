import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, handle, HttpError, ok, readJson, signMobileToken } from "@/server/api/http";
import { user as serializeUser } from "@/server/api/serializers";
import { verifyOtp } from "@/server/otp";

export const POST = handle(async (req) => {
  const { phone, code } = await readJson(
    req,
    z.object({ phone: z.string().trim(), code: z.string().regex(/^\d{4}$/) }),
  );
  if (!(await verifyOtp(phone, code))) throw badRequest("Invalid code");

  // First sign-in creates a customer; drivers are created from the portal.
  const account = await db.mobileUser.upsert({
    where: { phone },
    create: { phone, role: "customer" },
    update: {},
    include: { _count: { select: { addresses: { where: { deletedAt: null } } } } },
  });
  if (!account.isActive) throw new HttpError(403, "This account is disabled");

  return ok({ token: await signMobileToken(account.id), user: serializeUser(account) });
});
