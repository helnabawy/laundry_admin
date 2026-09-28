import { handle, langOf, mobileUser, ok } from "@/server/api/http";
import { INVOICE_FAQS } from "@/server/support-faqs";

export const GET = handle(async (req) => {
  await mobileUser(req);
  const lang = langOf(req);
  return ok(INVOICE_FAQS.map((f) => ({ id: f.id, question: f.question[lang], answer: f.answer[lang] })));
});
