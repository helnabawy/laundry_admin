import { z } from "zod";
import { db } from "@/server/db";
import { handle, mobileUser, ok, readJson } from "@/server/api/http";

export const POST = handle(async (req) => {
  const me = await mobileUser(req);
  const body = await readJson(
    req,
    z.object({
      orderId: z.string().optional(),
      topic: z.string().max(50).default("invoice"),
      transcript: z.array(z.object({ author: z.string().max(20), text: z.string().max(4000) })).max(100),
    }),
  );
  const order = body.orderId
    ? await db.order.findFirst({ where: { id: body.orderId, customerId: me.id } })
    : null;
  const count = await db.supportRequest.count();
  const created = await db.supportRequest.create({
    data: {
      reference: `S-${1041 + count}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      userId: me.id,
      orderId: order?.id,
      topic: body.topic,
      transcript: body.transcript,
    },
  });
  return ok({ id: created.id, reference: created.reference }, 201);
});
