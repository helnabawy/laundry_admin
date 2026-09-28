import { z } from "zod";
import { handle, langOf, mobileUser, ok, readJson } from "@/server/api/http";
import { ASSISTANT_FALLBACK, INVOICE_FAQS } from "@/server/support-faqs";

export const POST = handle(async (req) => {
  await mobileUser(req);
  const { question } = await readJson(
    req,
    z.object({ orderId: z.string().optional(), topic: z.string().optional(), question: z.string().max(2000) }),
  );
  const lang = langOf(req);
  const text = question.toLowerCase();
  const match = INVOICE_FAQS.find((f) => f.keywords.some((k) => text.includes(k)));
  return ok(
    match
      ? { text: match.answer[lang], understood: true }
      : { text: ASSISTANT_FALLBACK[lang], understood: false },
  );
});
