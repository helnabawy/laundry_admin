/**
 * Text for system-tray push notifications. Mirrors the app's ARB catalogue
 * (laundry_app/lib/l10n/app_{en,ar}.arb, `notif*` keys) so a push reads the
 * same as the in-app notification list. Pure — no I/O.
 */

export type PushLang = "en" | "ar";

type Copy = { title: string; body: (n: string) => string };

const EN: Record<string, Copy> = {
  driverAssigned: { title: "Driver assigned", body: (n) => `A driver will collect order ${n} in your pickup window.` },
  pickedUp: { title: "Items collected", body: (n) => `Order ${n} is on its way to the laundry.` },
  invoiceReady: {
    title: "Invoice ready",
    body: (n) => `Your items for order ${n} were counted and priced. Review the invoice and pay to start cleaning.`,
  },
  processing: { title: "Cleaning started", body: (n) => `Payment for order ${n} is settled and your items are being cleaned.` },
  outForDelivery: { title: "Out for delivery", body: (n) => `Order ${n} is on its way back to you.` },
  delivered: { title: "Delivered", body: (n) => `Order ${n} was handed over. Thank you.` },
  pickupFailed: {
    title: "We couldn't collect your order",
    body: (n) => `Order ${n} was cancelled. Book a new pickup time and we'll come back.`,
  },
  deliveryFailed: { title: "We couldn't deliver", body: (n) => `Our driver couldn't hand over order ${n}.` },
  cancelled: { title: "Order cancelled", body: (n) => `Order ${n} was cancelled.` },
  newPickup: { title: "New pickup", body: (n) => `Order ${n} was added to your pickups.` },
  newDelivery: { title: "New delivery", body: (n) => `Order ${n} is ready to deliver.` },
  update: { title: "Order update", body: (n) => `Order ${n} has a new status.` },
};

const AR: Record<string, Copy> = {
  driverAssigned: { title: "تم تعيين سائق", body: (n) => `سيستلم السائق الطلب ${n} في موعد الاستلام.` },
  pickedUp: { title: "تم استلام القطع", body: (n) => `الطلب ${n} في الطريق إلى المغسلة.` },
  invoiceReady: { title: "الفاتورة جاهزة", body: (n) => `تم عدّ قطع الطلب ${n} وتسعيرها. راجع الفاتورة وادفع لنبدأ التنظيف.` },
  processing: { title: "بدأ التنظيف", body: (n) => `تمت تسوية دفعة الطلب ${n} وقطعك قيد التنظيف.` },
  outForDelivery: { title: "في الطريق إليك", body: (n) => `الطلب ${n} في الطريق إليك.` },
  delivered: { title: "تم التسليم", body: (n) => `تم تسليم الطلب ${n}. شكرًا لك.` },
  pickupFailed: { title: "تعذّر استلام طلبك", body: (n) => `أُلغي الطلب ${n}. اختر موعد استلام جديدًا وسنعود إليك.` },
  deliveryFailed: { title: "تعذّر التسليم", body: (n) => `لم يتمكن السائق من تسليم الطلب ${n}.` },
  cancelled: { title: "تم إلغاء الطلب", body: (n) => `تم إلغاء الطلب ${n}.` },
  newPickup: { title: "استلام جديد", body: (n) => `أُضيف الطلب ${n} إلى مهام الاستلام.` },
  newDelivery: { title: "تسليم جديد", body: (n) => `الطلب ${n} جاهز للتسليم.` },
  update: { title: "تحديث على الطلب", body: (n) => `للطلب ${n} حالة جديدة.` },
};

/** Title and body for a mobile notification kind; unknown kinds read as a generic update. */
export function pushCopy(lang: PushLang, kind: string, orderNumber: number) {
  const table = lang === "ar" ? AR : EN;
  const copy = table[kind] ?? table.update;
  return { title: copy.title, body: copy.body(String(orderNumber)) };
}

/** FCM topic every app install that picked a laundry subscribes to. */
export function vendorTopic(vendorId: string) {
  return `vendor-${vendorId.replace(/[^a-zA-Z0-9_.~%-]/g, "_")}`;
}
