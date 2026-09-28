/**
 * Seeds the catalogue and accounts the Flutter app's mock uses, with the same
 * ids, so the app behaves the same against the real API.
 *
 *   pnpm db:seed          catalogue, accounts, slot windows
 *   pnpm db:seed --demo   … plus ~6 weeks of demo orders for the dashboard
 *
 * Idempotent: re-running updates rows in place.
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type OrderStatus } from "../src/generated/prisma/client";
import { invoiceTotals } from "../src/domain/pricing";
import { PATHS } from "../src/domain/order-workflow";
import { localDateOf, localMinuteToInstant, slotId } from "../src/domain/slots";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEV_PASSWORD = "ChangeMe123!";

const categories = [
  {
    id: "cat-clothes",
    nameEn: "Clothes",
    nameAr: "ملابس",
    descriptionEn: "Wash, iron, full service",
    descriptionAr: "غسيل، كي، خدمة كاملة",
    iconKey: "shirt",
    imageUrl: "/catalog/cat-clothes.webp",
  },
  {
    id: "cat-textiles",
    nameEn: "Home Textiles",
    nameAr: "مفروشات",
    descriptionEn: "Sheets, covers, pillows",
    descriptionAr: "مفارش، أغطية، وسائد",
    iconKey: "bed",
    imageUrl: "/catalog/cat-textiles.webp",
  },
  {
    id: "cat-carpets",
    nameEn: "Carpets",
    nameAr: "سجاد",
    descriptionEn: "Deep cleaning & wash",
    descriptionAr: "تنظيف عميق وغسيل",
    iconKey: "carpet",
    imageUrl: "/catalog/cat-carpets.webp",
  },
  {
    id: "cat-curtains",
    nameEn: "Curtains",
    nameAr: "ستائر",
    descriptionEn: "Take-down, wash & iron",
    descriptionAr: "فك، غسيل، وكي",
    iconKey: "curtain",
    imageUrl: "/catalog/cat-curtains.webp",
  },
];

const subServices = [
  ["sub-wash-only", "cat-clothes", "Wash only", "غسيل فقط", "Wash & dry, no iron", "غسيل وتجفيف بدون كي"],
  ["sub-wash-iron", "cat-clothes", "Wash & Iron", "غسيل وكي", "Wash, dry & full iron", "غسيل وتجفيف وكي كامل"],
  ["sub-iron-only", "cat-clothes", "Iron only", "كي فقط", "Iron clean items", "كي القطع النظيفة"],
  ["sub-full-service", "cat-clothes", "Full Service", "خدمة كاملة", "Wash, iron, hang & wrap", "غسيل وكي وتعليق وتغليف"],
  ["sub-textiles-wash", "cat-textiles", "Wash & Iron", "غسيل وكي", "Sheets, covers & pillows", "مفارش وأغطية ووسائد"],
  ["sub-carpet-deep", "cat-carpets", "Deep cleaning & wash", "تنظيف عميق وغسيل", "Dust & stain removal", "إزالة الأتربة والبقع"],
  ["sub-curtain-full", "cat-curtains", "Take-down, wash & iron", "فك، غسيل، وكي", "Removed & re-hung at home", "فك من المنزل وإعادة تركيب"],
] as const;

const WASH_IRON = ["Wash & iron", "غسيل وكي"] as const;
const DEEP = ["Deep cleaning & wash", "تنظيف عميق وغسيل"] as const;
const CURTAIN = ["Take-down, wash & iron", "فك، غسيل، وكي"] as const;

const products = [
  ["prod-tshirt", "cat-clothes", "T-shirt", "تي شيرت", WASH_IRON, 2],
  ["prod-shirt", "cat-clothes", "Shirt", "قميص", WASH_IRON, 10],
  ["prod-trouser", "cat-clothes", "Trouser", "بنطلون", WASH_IRON, 15],
  ["prod-jacket", "cat-clothes", "Jacket", "جاكيت", WASH_IRON, 25],
  ["prod-dress", "cat-clothes", "Dress", "فستان", WASH_IRON, 30],
  ["prod-suit", "cat-clothes", "Suit", "بدلة", ["Wash & iron, jacket & trouser", "غسيل وكي، جاكيت وبنطلون"], 45],
  ["prod-bedsheet", "cat-textiles", "Bedsheet", "ملاءة سرير", WASH_IRON, 20],
  ["prod-pillowcase", "cat-textiles", "Pillowcase", "كيس وسادة", WASH_IRON, 6],
  ["prod-duvet-cover", "cat-textiles", "Duvet cover", "غطاء لحاف", WASH_IRON, 35],
  ["prod-towel", "cat-textiles", "Towel", "منشفة", ["Wash", "غسيل"], 8],
  ["prod-carpet-small", "cat-carpets", "Small carpet", "سجادة صغيرة", DEEP, 60],
  ["prod-carpet-large", "cat-carpets", "Large carpet", "سجادة كبيرة", DEEP, 120],
  ["prod-rug", "cat-carpets", "Rug", "كليم", DEEP, 40],
  ["prod-curtain-panel", "cat-curtains", "Curtain panel", "ستارة (قطعة)", CURTAIN, 30],
  ["prod-curtain-set", "cat-curtains", "Curtain set", "طقم ستائر", CURTAIN, 55],
] as const;

const tiers = [
  {
    id: "tier-standard",
    nameEn: "Standard",
    nameAr: "عادي",
    deliveryHours: 48,
    isVip: false,
    surchargeType: "none" as const,
    surchargeValue: 0,
    perks: [
      { en: "Free pickup & delivery", ar: "استلام وتسليم مجاني" },
      { en: "Daily slots available", ar: "مواعيد يومية متاحة" },
    ],
    sortOrder: 0,
  },
  {
    id: "tier-vip",
    nameEn: "VIP",
    nameAr: "VIP",
    deliveryHours: 24,
    isVip: true,
    surchargeType: "percentage" as const,
    surchargeValue: 15,
    perks: [
      { en: "Priority processing", ar: "أولوية في المعالجة" },
      { en: "Extended delivery slots", ar: "مواعيد تسليم موسعة" },
    ],
    sortOrder: 1,
  },
];

const windows = [
  { id: "win-0900", startMinute: 9 * 60, endMinute: 11 * 60 },
  { id: "win-1100", startMinute: 11 * 60, endMinute: 13 * 60 },
  { id: "win-1600", startMinute: 16 * 60, endMinute: 18 * 60 },
  { id: "win-1800", startMinute: 18 * 60, endMinute: 20 * 60 },
];

async function seedBase() {
  const vendor = await db.vendor.upsert({
    where: { slug: "main" },
    create: {
      id: "fac-1",
      slug: "main",
      nameEn: "Laundry",
      nameAr: "غسيل",
      codFee: 5,
    },
    update: {},
  });

  for (const [i, c] of categories.entries()) {
    await db.serviceCategory.upsert({
      where: { id: c.id },
      create: { ...c, vendorId: vendor.id, sortOrder: i },
      update: { ...c, sortOrder: i },
    });
  }
  for (const [i, [id, categoryId, nameEn, nameAr, descriptionEn, descriptionAr]] of subServices.entries()) {
    const data = { categoryId, nameEn, nameAr, descriptionEn, descriptionAr, sortOrder: i };
    await db.subService.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (const [i, [id, categoryId, nameEn, nameAr, [descriptionEn, descriptionAr], unitPrice]] of products.entries()) {
    const data = { vendorId: vendor.id, categoryId, nameEn, nameAr, descriptionEn, descriptionAr, unitPrice, sortOrder: i };
    await db.product.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (const t of tiers) {
    await db.serviceTier.upsert({
      where: { id: t.id },
      create: { ...t, vendorId: vendor.id },
      update: t,
    });
  }
  for (const [i, w] of windows.entries()) {
    await db.slotWindow.upsert({
      where: { id: w.id },
      create: { ...w, vendorId: vendor.id, capacity: 8, sortOrder: i },
      update: {},
    });
  }

  // Mobile accounts from the app's mock (OTP is DEV_OTP_CODE, default 1234).
  const customer = await db.mobileUser.upsert({
    where: { phone: "+971501234567" },
    create: { id: "usr-customer-1", phone: "+971501234567", fullName: "خالد المنصوري", role: "customer" },
    update: {},
  });
  const drivers = [
    { id: "usr-driver-1", phone: "+971500000001", fullName: "أحمد علي" },
    { id: "usr-driver-2", phone: "+971500000002", fullName: "Rashid Khan" },
  ];
  for (const d of drivers) {
    await db.mobileUser.upsert({
      where: { phone: d.phone },
      create: { ...d, role: "driver", vendorId: vendor.id },
      update: { role: "driver", vendorId: vendor.id },
    });
  }
  const addresses = [
    { id: "adr-1", kind: "home" as const, area: "الخالدية", building: "12", floor: "7", apartment: "704", latitude: 24.4672, longitude: 54.3532 },
    { id: "adr-2", kind: "work" as const, area: "الميناء", building: "3", floor: "2", apartment: "210", latitude: 24.519, longitude: 54.379 },
  ];
  for (const a of addresses) {
    await db.address.upsert({
      where: { id: a.id },
      create: { ...a, city: "أبوظبي", userId: customer.id },
      update: {},
    });
  }

  // Portal accounts.
  const passwordHash = await hash(DEV_PASSWORD);
  const staff = [
    { email: "super@laundry.local", name: "Platform Admin", role: "SUPER_ADMIN" as const, vendorId: null },
    { email: "admin@laundry.local", name: "Laundry Manager", role: "ADMIN" as const, vendorId: vendor.id },
    { email: "operator@laundry.local", name: "Facility Operator", role: "USER" as const, vendorId: vendor.id },
  ];
  for (const s of staff) {
    await db.staffUser.upsert({
      where: { email: s.email },
      create: { ...s, passwordHash },
      update: {},
    });
  }

  return { vendor, customer };
}

// ---- Demo orders ----------------------------------------------------------

/** Deterministic PRNG so demo data is stable across runs. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function seedDemo(vendorId: string, customerId: string) {
  const existing = await db.order.count({ where: { vendorId } });
  if (existing > 0) {
    console.log(`  demo: skipped (${existing} orders already exist)`);
    return;
  }
  const rand = rng(42);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const address = await db.address.findFirstOrThrow({ where: { userId: customerId } });
  const customer = await db.mobileUser.findUniqueOrThrow({ where: { id: customerId } });
  const allProducts = await db.product.findMany({ where: { vendorId } });
  const allTiers = await db.serviceTier.findMany({ where: { vendorId } });
  const subs = await db.subService.findMany();
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: vendorId } });
  let number = vendor.orderSeq;

  const now = Date.now();
  const DAY = 86_400_000;

  for (let daysAgo = 42; daysAgo >= 0; daysAgo--) {
    const perDay = 2 + Math.floor(rand() * 6);
    for (let k = 0; k < perDay; k++) {
      number++;
      const kind = rand() < 0.55 ? "SHOP" : "WIZARD";
      const tier = rand() < 0.25 ? allTiers.find((t) => t.isVip)! : allTiers.find((t) => !t.isVip)!;
      const createdAt = new Date(now - daysAgo * DAY - Math.floor(rand() * 10) * 3_600_000);
      const pickupDate = localDateOf(new Date(createdAt.getTime() + DAY));
      const win = pick(windows);
      const pickupStart = localMinuteToInstant(pickupDate, win.startMinute);
      const deliveryDate = localDateOf(new Date(pickupStart.getTime() + tier.deliveryHours * 3_600_000));
      const dwin = pick(windows);

      // How far along the path this order got: old orders are finished.
      const path = PATHS[kind];
      let status: OrderStatus;
      let failed: "pickup" | "delivery" | null = null;
      if (daysAgo > 3) {
        const r = rand();
        if (r < 0.05) { status = "cancelled"; failed = "pickup"; }
        else if (r < 0.08) { status = "deliveryFailed"; failed = "delivery"; }
        else if (r < 0.1) status = "cancelled";
        else status = "delivered";
      } else {
        status = path[Math.floor(rand() * path.length)];
      }
      const reached =
        status === "delivered" ? path.length - 1
        : status === "cancelled" ? (failed ? 1 : Math.floor(rand() * 3))
        : status === "deliveryFailed" ? path.indexOf("outForDelivery")
        : path.indexOf(status);

      const payMethod = rand() < 0.6 ? ("card" as const) : ("cashOnDelivery" as const);
      const hasInvoice = kind === "SHOP" || reached >= path.indexOf("awaitingPayment");
      const items = hasInvoice
        ? Array.from({ length: 1 + Math.floor(rand() * 4) }, () => {
            const p = pick(allProducts);
            return { p, quantity: 1 + Math.floor(rand() * 4) };
          })
        : [];
      const totals = invoiceTotals({
        lines: items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.p.unitPrice) })),
        tier: { surchargeType: tier.surchargeType, surchargeValue: Number(tier.surchargeValue) },
        paymentMethod: kind === "SHOP" || reached > path.indexOf("awaitingPayment") ? payMethod : null,
        vendorCodFee: Number(vendor.codFee),
      });
      const paymentChosen = kind === "SHOP" || reached > path.indexOf("awaitingPayment");
      const paid = paymentChosen && (payMethod === "card" || status === "delivered");

      const events: { status: OrderStatus; at: Date; actorType: "staff" | "driver" | "customer" | "system" }[] = [];
      let t = createdAt.getTime();
      for (let i = 0; i <= reached; i++) {
        const s = path[i];
        events.push({ status: s, at: new Date(t), actorType: s === "pending" ? "customer" : s === "pickedUp" || s === "delivered" ? "driver" : "staff" });
        t += (s === "processing" ? 10 : 2 + rand() * 6) * 3_600_000;
      }
      if (failed === "pickup") {
        events.push({ status: "pickupFailed", at: new Date(t), actorType: "driver" });
        events.push({ status: "cancelled", at: new Date(t + 1000), actorType: "system" });
      } else if (status === "cancelled") {
        events.push({ status: "cancelled", at: new Date(t), actorType: "staff" });
      } else if (status === "deliveryFailed") {
        events.push({ status: "deliveryFailed", at: new Date(t), actorType: "driver" });
      }

      const driver = rand() < 0.5 ? "usr-driver-1" : "usr-driver-2";
      await db.order.create({
        data: {
          vendorId,
          number,
          kind,
          status,
          customerId,
          customerName: customer.fullName ?? "",
          customerPhone: customer.phone,
          addressSnapshot: { id: address.id, kind: address.kind, label: address.label, city: address.city, area: address.area, building: address.building, floor: address.floor, apartment: address.apartment, alternatePhone: address.alternatePhone, latitude: address.latitude, longitude: address.longitude },
          tierId: tier.id,
          pickupSlotId: slotId(pickupDate, win.id),
          pickupStart,
          pickupEnd: localMinuteToInstant(pickupDate, win.endMinute),
          deliverySlotId: slotId(deliveryDate, dwin.id),
          deliveryStart: localMinuteToInstant(deliveryDate, dwin.startMinute),
          deliveryEnd: localMinuteToInstant(deliveryDate, dwin.endMinute),
          pickupDriverId: reached >= 1 || failed ? driver : null,
          deliveryDriverId: reached >= path.indexOf("outForDelivery") ? driver : null,
          createdAt,
          events: { create: events },
          lines:
            kind === "WIZARD"
              ? { create: [{ categoryId: "cat-clothes", subServiceId: pick(subs.filter((s) => s.categoryId === "cat-clothes")).id }] }
              : undefined,
          failures: failed
            ? { create: [{ stage: failed, reason: pick(["customerAbsent", "wrongAddress", "customerRescheduled"] as const), driverId: driver }] }
            : undefined,
          rating:
            status === "delivered" && rand() < 0.4
              ? { create: { stars: 3 + Math.floor(rand() * 3), ratedAt: new Date(t + DAY) } }
              : undefined,
          invoice: hasInvoice
            ? {
                create: {
                  number: `${vendor.invoicePrefix}-${number}`,
                  paymentMethod: paymentChosen ? payMethod : null,
                  paid,
                  paidAt: paid ? new Date(t) : null,
                  vipSurcharge: totals.vipSurcharge,
                  codFee: paymentChosen ? totals.codFee : 0,
                  conditionsAcknowledged: paymentChosen,
                  items: {
                    create: items.map((i, idx) => ({
                      nameEn: i.p.nameEn,
                      nameAr: i.p.nameAr,
                      quantity: i.quantity,
                      unitPrice: i.p.unitPrice,
                      productId: i.p.id,
                      categoryId: i.p.categoryId,
                      sortOrder: idx,
                    })),
                  },
                  conditions:
                    kind === "WIZARD" && rand() < 0.3
                      ? { create: [{ itemName: items[0].p.nameEn, kind: pick(["stain", "damage"] as const), note: "Found at sorting" }] }
                      : undefined,
                },
              }
            : undefined,
        },
      });
    }
  }
  await db.vendor.update({ where: { id: vendorId }, data: { orderSeq: number } });
  console.log(`  demo: ${number - vendor.orderSeq} orders`);
}

async function main() {
  const { vendor, customer } = await seedBase();
  console.log("Seeded catalogue, accounts and slot windows.");
  if (process.argv.includes("--demo")) await seedDemo(vendor.id, customer.id);
  console.log(`
Portal logins (password: ${DEV_PASSWORD})
  super@laundry.local     SUPER_ADMIN
  admin@laundry.local     ADMIN
  operator@laundry.local  USER
Mobile (OTP ${process.env.DEV_OTP_CODE || "via SMS"})
  customer +971501234567 · drivers +971500000001, +971500000002`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
