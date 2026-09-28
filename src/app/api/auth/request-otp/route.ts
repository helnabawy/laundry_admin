import { z } from "zod";
import { handle, noContent, readJson } from "@/server/api/http";
import { requestOtp } from "@/server/otp";

export const POST = handle(async (req) => {
  const { phone } = await readJson(req, z.object({ phone: z.string().trim() }));
  await requestOtp(phone);
  return noContent();
});
