/**
 * Invoice FAQ shown before the assistant and a person (the app's support
 * ladder). Ported from the app's support mock; the assistant matches the
 * same keywords until a real one is wired in.
 */
export const INVOICE_FAQS = [
  {
    id: "price-after-inspection",
    question: {
      ar: "لماذا لم يظهر السعر عند الحجز؟",
      en: "Why wasn't the price shown when I booked?",
    },
    answer: {
      ar: "يُحدَّد السعر بعد أن تفحص المغسلة القطع وتعدّها، لذلك تعكس الفاتورة ما استُلم فعلًا وليس تقديرًا.",
      en: "The price is set once the laundry has inspected and counted your items, so the invoice reflects what was actually received rather than an estimate.",
    },
    keywords: ["price", "cost", "expensive", "much", "سعر", "غالي", "تكلفة"],
  },
  {
    id: "item-count",
    question: { ar: "كيف تم عدّ القطع؟", en: "How were my items counted?" },
    answer: {
      ar: "تعدّ المغسلة كل قطعة وتفرزها عند وصولها، وتعرض الفاتورة نوع كل قطعة وعددها وسعر الوحدة.",
      en: "The laundry counts and sorts every piece when it arrives. The invoice lists each item type with its quantity and unit price.",
    },
    keywords: ["count", "number", "missing", "quantity", "عدد", "ناقص", "كم"],
  },
  {
    id: "stains-damage",
    question: {
      ar: "لماذا تم إبلاغي ببقع أو تلف؟",
      en: "Why was I told about stains or damage?",
    },
    answer: {
      ar: "بعد الفرز وقبل بدء التنظيف، تسجّل المغسلة أي بقع أو تلف موجود مسبقًا حتى تعرف حالة القطعة قبل معالجتها. تجد التفاصيل في تقرير الحالة على الفاتورة.",
      en: "After sorting and before cleaning starts, the laundry records any stains or existing damage so you know an item's condition before it is treated. The details are in the condition report on your invoice.",
    },
    keywords: ["stain", "damage", "torn", "hole", "بقع", "بقعة", "تلف", "مقطوع"],
  },
  {
    id: "payment-options",
    question: { ar: "كيف يمكنني الدفع؟", en: "How can I pay?" },
    answer: {
      ar: "يمكنك الدفع بالبطاقة البنكية الآن، أو نقدًا للسائق عند التسليم.",
      en: "By bank card now, or in cash to the driver on delivery.",
    },
    keywords: ["pay", "card", "cash", "دفع", "بطاقة", "كاش", "نقد"],
  },
] as const;

export const ASSISTANT_FALLBACK = {
  ar: "لم أتمكن من فهم سؤالك بالكامل.",
  en: "I couldn't quite work out what you're asking.",
};
