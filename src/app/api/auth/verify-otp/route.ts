import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, handle, HttpError, ok, readJson, signMobileToken } from "@/server/api/http";
import { user as serializeUser } from "@/server/api/serializers";
import { verifyOtp } from "@/server/otp";

export const POST = handle(async (req) => {
  const { phone, code, fullName } = await readJson(
    req,
    z.object({
      phone: z.string().trim(),
      code: z.string().regex(/^\d{4}$/),
      // Sent for a number that isn't registered yet: the account is created
      // with this name, linking the number to it.
      fullName: z.string().trim().max(120).nullish(),
    }),
  );
  if (!(await verifyOtp(phone, code))) throw badRequest("Invalid code");

  const name = fullName?.trim() || null;
  const existing = await db.mobileUser.findUnique({ where: { phone } });
  const account = existing
    ? // An existing name is never overwritten by what was typed at login.
      existing.fullName?.trim() || !name
      ? existing
      : await db.mobileUser.update({ where: { id: existing.id }, data: { fullName: name } })
    : // First sign-in creates a customer; drivers are created from the portal.
      await db.mobileUser.create({ data: { phone, role: "customer", fullName: name } });
  if (!account.isActive) throw new HttpError(403, "This account is disabled");

  const addresses = await db.address.count({ where: { userId: account.id, deletedAt: null } });
  return ok({
    token: await signMobileToken(account.id),
    user: serializeUser({ ...account, _count: { addresses } }),
  });
});
