import { z } from "zod";
import { db } from "@/server/db";
import { handle, langOf, mobileUser, noContent, readJson } from "@/server/api/http";

const deviceSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["ios", "android", "web"]),
});

// POST /api/me/devices — registers (or moves) this install's FCM token to the
// signed-in user. The push language follows the request's Accept-Language.
export const POST = handle(async (req) => {
  const me = await mobileUser(req);
  const { token, platform } = await readJson(req, deviceSchema);
  const locale = langOf(req);
  await db.deviceToken.upsert({
    where: { token },
    create: { token, platform, locale, mobileUserId: me.id },
    update: { platform, locale, mobileUserId: me.id },
  });
  return noContent();
});

// DELETE /api/me/devices — on sign-out, so the next user of this phone doesn't
// receive the previous user's pushes.
export const DELETE = handle(async (req) => {
  const me = await mobileUser(req);
  const { token } = await readJson(req, deviceSchema.pick({ token: true }));
  await db.deviceToken.deleteMany({ where: { token, mobileUserId: me.id } });
  return noContent();
});
