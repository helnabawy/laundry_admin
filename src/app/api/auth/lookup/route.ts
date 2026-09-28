import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, handle, ok, readJson } from "@/server/api/http";
import { UAE_PHONE } from "@/server/otp";

/**
 * POST /api/auth/lookup {phone} → {registered}
 *
 * Lets the login screen decide between "Log in" (a known number) and
 * "Verify" with a full-name field (a new number). Only a yes/no: the
 * account's name is never returned, so typing numbers can't reveal who owns
 * them. The OTP still proves the phone is in hand either way.
 */
export const POST = handle(async (req) => {
  const { phone } = await readJson(req, z.object({ phone: z.string().trim() }));
  if (!UAE_PHONE.test(phone)) throw badRequest("Enter a UAE mobile number");
  const user = await db.mobileUser.findUnique({
    where: { phone },
    select: { fullName: true, role: true, isActive: true },
  });
  // A number that signed up but never gave a name still needs one.
  const registered = !!user && user.isActive && !!user.fullName?.trim();
  return ok({ registered });
});
