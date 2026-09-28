import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { tr, type Lang } from "./http";

/**
 * JSON shapes the Flutter app's `*Model.fromJson` expect. Field names here are
 * a contract — see laundry_app/lib/features/**\/data/models.
 */

const num = (d: Prisma.Decimal | number) => Number(d);

export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

interface Bilingual {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export function category(
  lang: Lang,
  c: Bilingual & { id: string; iconKey: string; imageUrl: string | null },
) {
  return {
    id: c.id,
    name: tr(lang, c.nameEn, c.nameAr),
    description: tr(lang, c.descriptionEn, c.descriptionAr),
    // Not read by the app yet (it picks icons from the id); non-breaking.
    iconKey: c.iconKey,
    imageUrl: absoluteUrl(c.imageUrl),
  };
}

export function subService(
  lang: Lang,
  s: Bilingual & { id: string; categoryId: string },
) {
  return {
    id: s.id,
    categoryId: s.categoryId,
    name: tr(lang, s.nameEn, s.nameAr),
    description: tr(lang, s.descriptionEn, s.descriptionAr),
  };
}

export function product(
  lang: Lang,
  p: Bilingual & {
    id: string;
    categoryId: string;
    unitPrice: Prisma.Decimal;
    imageUrl: string | null;
    isActive: boolean;
  },
) {
  return {
    id: p.id,
    categoryId: p.categoryId,
    name: tr(lang, p.nameEn, p.nameAr),
    description: tr(lang, p.descriptionEn, p.descriptionAr),
    unitPrice: num(p.unitPrice),
    // `imageAsset` is a bundled asset path in the app — never send a URL there.
    imageUrl: absoluteUrl(p.imageUrl),
    isActive: p.isActive,
  };
}

type Perk = { en?: string; ar?: string };

export function tier(
  lang: Lang,
  t: {
    id: string;
    nameEn: string;
    nameAr: string;
    deliveryHours: number;
    isVip: boolean;
    perks: Prisma.JsonValue;
    surchargeType: string;
    surchargeValue: Prisma.Decimal;
  },
) {
  const perks = Array.isArray(t.perks) ? (t.perks as Perk[]) : [];
  return {
    id: t.id,
    name: tr(lang, t.nameEn, t.nameAr),
    deliveryHours: t.deliveryHours,
    isVip: t.isVip,
    perks: perks.map((p) => tr(lang, p.en ?? "", p.ar ?? "")),
    surchargeType: t.surchargeType,
    surchargeValue: num(t.surchargeValue),
  };
}

export function slot(s: { id: string; start: Date; end: Date; isFull: boolean }) {
  return {
    id: s.id,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    isFull: s.isFull,
  };
}

export function address(a: {
  id: string;
  kind: string;
  label: string | null;
  city: string;
  area: string;
  building: string;
  floor: string | null;
  apartment: string;
  alternatePhone: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    city: a.city,
    area: a.area,
    building: a.building,
    floor: a.floor,
    apartment: a.apartment,
    alternatePhone: a.alternatePhone,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

export function user(u: {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  _count?: { addresses: number };
  addresses?: unknown[];
}) {
  const addressCount = u._count?.addresses ?? u.addresses?.length ?? 0;
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role,
    // Drivers have no profile step; customers need a name and an address.
    profileCompleted:
      u.role !== "customer" || (!!u.fullName?.trim() && addressCount > 0),
  };
}

// ---- Orders -----------------------------------------------------------------

export const orderInclude = {
  lines: { include: { category: true, subService: true } },
  tier: true,
  events: { orderBy: [{ at: "asc" }, { id: "asc" }] },
  invoice: {
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      conditions: true,
    },
  },
  failures: { orderBy: { createdAt: "desc" }, take: 1 },
  rating: true,
  pickupDriver: { select: { id: true, fullName: true, phone: true } },
  deliveryDriver: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const DELIVERY_LEG = new Set([
  "outForDelivery",
  "delivered",
  "deliveryFailed",
]);

export function invoice(lang: Lang, inv: NonNullable<FullOrder["invoice"]>) {
  return {
    id: inv.number,
    items: inv.items.map((i) => ({
      name: tr(lang, i.nameEn, i.nameAr),
      quantity: i.quantity,
      unitPrice: num(i.unitPrice),
      productId: i.productId,
      categoryId: i.categoryId,
    })),
    conditions: inv.conditions.map((c) => ({
      itemName: c.itemName,
      kind: c.kind,
      note: c.note,
      photoUrl: absoluteUrl(c.photoUrl),
    })),
    note: inv.note,
    paymentMethod: inv.paymentMethod,
    vipSurcharge: num(inv.vipSurcharge),
    codFee: num(inv.codFee),
    paid: inv.paid,
  };
}

export function order(lang: Lang, o: FullOrder) {
  const driver = DELIVERY_LEG.has(o.status) ? o.deliveryDriver : o.pickupDriver;
  const failure = o.failures[0];
  return {
    id: o.id,
    number: o.number,
    lines: o.lines.map((l) => ({
      category: category(lang, l.category),
      subService: subService(lang, l.subService),
    })),
    tier: tier(lang, o.tier),
    pickupSlot: slot({
      id: o.pickupSlotId,
      start: o.pickupStart,
      end: o.pickupEnd,
      isFull: false,
    }),
    deliverySlot: slot({
      id: o.deliverySlotId,
      start: o.deliveryStart,
      end: o.deliveryEnd,
      isFull: false,
    }),
    address: o.addressSnapshot,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    timeline: o.events.map((e) => ({ status: e.status, at: e.at.toISOString() })),
    driverName: driver?.fullName ?? null,
    invoice: o.invoice ? invoice(lang, o.invoice) : null,
    failure: failure
      ? {
          reason: failure.reason,
          note: failure.note,
          photoUrl: absoluteUrl(failure.photoUrl),
        }
      : null,
    rating: o.rating
      ? {
          stars: o.rating.stars,
          comment: o.rating.comment,
          ratedAt: o.rating.ratedAt.toISOString(),
        }
      : null,
  };
}

export function notification(n: {
  id: string;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: n.id,
    kind: n.kind,
    orderId: n.orderId ?? "",
    orderNumber: n.orderNumber ?? 0,
    sentAt: n.createdAt.toISOString(),
    read: n.readAt != null,
  };
}
