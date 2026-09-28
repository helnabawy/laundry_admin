"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/server/db";
import { requireCapability, type Session } from "@/server/auth/session";
import { assertVendorAccess, vendorForWrite } from "@/server/auth/scope";
import { audit } from "@/server/orders/transition";
import { storeImage } from "@/server/storage";
import { CATEGORY_ICON_KEYS } from "@/lib/category-icons";
import { hhmmToMinute } from "@/domain/slots";
import { ActionError, run } from "./result";

/**
 * Catalogue management: services (categories), ways to clean (sub-services),
 * priced items (products), service levels (tiers) and time slots. Every name
 * is required in both languages.
 */

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(400).default("");

function done() {
  revalidatePath("/catalogue", "layout");
}

async function logChange(session: Session, vendorId: string, action: string, entity: string, entityId: string, data?: object) {
  await audit(db, { actorId: session.userId, vendorId, action, entity, entityId, data: data as never });
}

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

async function imageFrom(form: FormData, folder: string, current: string | null): Promise<string | null> {
  if (str(form, "removeImage") === "1") return null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) return storeImage(file, folder);
  return current;
}

// ---- Categories -------------------------------------------------------------

const categorySchema = z.object({
  nameEn: name,
  nameAr: name,
  descriptionEn: description,
  descriptionAr: description,
  iconKey: z.string().refine((k) => CATEGORY_ICON_KEYS.includes(k)),
  isActive: z.boolean(),
});

export async function saveCategoryAction(id: string | null, form: FormData) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const data = categorySchema.parse({
      nameEn: str(form, "nameEn"),
      nameAr: str(form, "nameAr"),
      descriptionEn: str(form, "descriptionEn"),
      descriptionAr: str(form, "descriptionAr"),
      iconKey: str(form, "iconKey"),
      isActive: str(form, "isActive") === "on",
    });
    if (id) {
      const existing = await db.serviceCategory.findUniqueOrThrow({ where: { id } });
      assertVendorAccess(session, existing.vendorId);
      const imageUrl = await imageFrom(form, "categories", existing.imageUrl);
      await db.serviceCategory.update({ where: { id }, data: { ...data, imageUrl } });
      await logChange(session, existing.vendorId, "category.update", "ServiceCategory", id, data);
      done();
      return id;
    }
    const vendorId = await vendorForWrite(session);
    const imageUrl = await imageFrom(form, "categories", null);
    const last = await db.serviceCategory.aggregate({ where: { vendorId }, _max: { sortOrder: true } });
    const created = await db.serviceCategory.create({
      data: { ...data, imageUrl, vendorId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await logChange(session, vendorId, "category.create", "ServiceCategory", created.id, data);
    done();
    return created.id;
  });
}

export async function deleteCategoryAction(id: string) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const t = await getTranslations("errors");
    const cat = await db.serviceCategory.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { orderLines: true, products: true } } },
    });
    assertVendorAccess(session, cat.vendorId);
    const usedByInvoices = await db.invoiceItem.count({ where: { categoryId: id } });
    if (cat._count.orderLines > 0 || usedByInvoices > 0 || cat._count.products > 0) throw new ActionError(t("inUse"));
    await db.serviceCategory.delete({ where: { id } });
    await logChange(session, cat.vendorId, "category.delete", "ServiceCategory", id);
    done();
  });
}

export async function moveCategoryAction(id: string, direction: "up" | "down") {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const cat = await db.serviceCategory.findUniqueOrThrow({ where: { id } });
    assertVendorAccess(session, cat.vendorId);
    const siblings = await db.serviceCategory.findMany({
      where: { vendorId: cat.vendorId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await db.$transaction(ids.map((cid, index) => db.serviceCategory.update({ where: { id: cid }, data: { sortOrder: index } })));
    done();
  });
}

// ---- Sub-services -----------------------------------------------------------

const subServiceSchema = z.object({
  nameEn: name,
  nameAr: name,
  descriptionEn: description,
  descriptionAr: description,
  isActive: z.boolean(),
});

export async function saveSubServiceAction(categoryId: string, id: string | null, input: z.input<typeof subServiceSchema>) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const data = subServiceSchema.parse(input);
    const cat = await db.serviceCategory.findUniqueOrThrow({ where: { id: categoryId } });
    assertVendorAccess(session, cat.vendorId);
    if (id) {
      const sub = await db.subService.findUniqueOrThrow({ where: { id } });
      if (sub.categoryId !== categoryId) throw new Error("Not found");
      await db.subService.update({ where: { id }, data });
      await logChange(session, cat.vendorId, "subService.update", "SubService", id, data);
    } else {
      const last = await db.subService.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
      const created = await db.subService.create({
        data: { ...data, categoryId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await logChange(session, cat.vendorId, "subService.create", "SubService", created.id, data);
    }
    done();
  });
}

export async function deleteSubServiceAction(id: string) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const t = await getTranslations("errors");
    const sub = await db.subService.findUniqueOrThrow({
      where: { id },
      include: { category: true, _count: { select: { orderLines: true } } },
    });
    assertVendorAccess(session, sub.category.vendorId);
    if (sub._count.orderLines > 0) throw new ActionError(t("inUse"));
    await db.subService.delete({ where: { id } });
    await logChange(session, sub.category.vendorId, "subService.delete", "SubService", id);
    done();
  });
}

// ---- Products ---------------------------------------------------------------

const productSchema = z.object({
  categoryId: z.string().min(1),
  nameEn: name,
  nameAr: name,
  descriptionEn: description,
  descriptionAr: description,
  unitPrice: z.coerce.number().min(0).max(100_000),
  isActive: z.boolean(),
});

export async function saveProductAction(id: string | null, form: FormData) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const data = productSchema.parse({
      categoryId: str(form, "categoryId"),
      nameEn: str(form, "nameEn"),
      nameAr: str(form, "nameAr"),
      descriptionEn: str(form, "descriptionEn"),
      descriptionAr: str(form, "descriptionAr"),
      unitPrice: str(form, "unitPrice"),
      isActive: str(form, "isActive") === "on",
    });
    const cat = await db.serviceCategory.findUniqueOrThrow({ where: { id: data.categoryId } });
    assertVendorAccess(session, cat.vendorId);
    const unitPrice = Math.round(data.unitPrice * 100) / 100;
    if (id) {
      const existing = await db.product.findUniqueOrThrow({ where: { id } });
      assertVendorAccess(session, existing.vendorId);
      const imageUrl = await imageFrom(form, "products", existing.imageUrl);
      await db.product.update({ where: { id }, data: { ...data, unitPrice, imageUrl, vendorId: cat.vendorId } });
      await logChange(session, cat.vendorId, "product.update", "Product", id, { ...data, unitPrice });
    } else {
      const imageUrl = await imageFrom(form, "products", null);
      const last = await db.product.aggregate({ where: { categoryId: cat.id }, _max: { sortOrder: true } });
      const created = await db.product.create({
        data: { ...data, unitPrice, imageUrl, vendorId: cat.vendorId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await logChange(session, cat.vendorId, "product.create", "Product", created.id, { ...data, unitPrice });
    }
    done();
  });
}

export async function deleteProductAction(id: string) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const t = await getTranslations("errors");
    const p = await db.product.findUniqueOrThrow({ where: { id }, include: { _count: { select: { invoiceItems: true } } } });
    assertVendorAccess(session, p.vendorId);
    if (p._count.invoiceItems > 0) throw new ActionError(t("inUse"));
    await db.product.delete({ where: { id } });
    await logChange(session, p.vendorId, "product.delete", "Product", id);
    done();
  });
}

export async function toggleProductAction(id: string, isActive: boolean) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const p = await db.product.findUniqueOrThrow({ where: { id } });
    assertVendorAccess(session, p.vendorId);
    await db.product.update({ where: { id }, data: { isActive } });
    await logChange(session, p.vendorId, isActive ? "product.show" : "product.hide", "Product", id);
    done();
  });
}

// ---- Tiers ------------------------------------------------------------------

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const tierSchema = z
  .object({
    nameEn: name,
    nameAr: name,
    deliveryHours: z.coerce.number().int().min(1).max(720),
    isVip: z.boolean(),
    surchargeType: z.enum(["none", "flat", "percentage"]),
    surchargeValue: z.coerce.number().min(0).max(100_000),
    perksEn: z.string().max(2000),
    perksAr: z.string().max(2000),
    isActive: z.boolean(),
  })
  .refine((v) => v.surchargeType !== "percentage" || v.surchargeValue <= 100, { path: ["surchargeValue"] });

export async function saveTierAction(id: string | null, input: z.input<typeof tierSchema>) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const v = tierSchema.parse(input);
    const en = lines(v.perksEn);
    const ar = lines(v.perksAr);
    const perks = Array.from({ length: Math.max(en.length, ar.length) }, (_, i) => ({ en: en[i] ?? "", ar: ar[i] ?? "" }));
    const data = {
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      deliveryHours: v.deliveryHours,
      isVip: v.isVip,
      surchargeType: v.surchargeType,
      surchargeValue: v.surchargeType === "none" ? 0 : v.surchargeValue,
      perks,
      isActive: v.isActive,
    };
    if (id) {
      const tier = await db.serviceTier.findUniqueOrThrow({ where: { id } });
      assertVendorAccess(session, tier.vendorId);
      await db.serviceTier.update({ where: { id }, data });
      await logChange(session, tier.vendorId, "tier.update", "ServiceTier", id, data);
    } else {
      const vendorId = await vendorForWrite(session);
      const created = await db.serviceTier.create({ data: { ...data, vendorId } });
      await logChange(session, vendorId, "tier.create", "ServiceTier", created.id, data);
    }
    done();
  });
}

// ---- Slot windows -----------------------------------------------------------

const slotSchema = z.object({
  start: z.string(),
  end: z.string(),
  capacity: z.coerce.number().int().min(1).max(500),
  isActive: z.boolean(),
});

export async function saveSlotWindowAction(id: string | null, input: z.input<typeof slotSchema>) {
  return run(async () => {
    const session = await requireCapability("catalogue.manage");
    const t = await getTranslations("catalogue");
    const v = slotSchema.parse(input);
    const startMinute = hhmmToMinute(v.start);
    const endMinute = hhmmToMinute(v.end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) throw new ActionError(t("slotInvalid"));
    const data = { startMinute, endMinute, capacity: v.capacity, isActive: v.isActive };
    if (id) {
      const w = await db.slotWindow.findUniqueOrThrow({ where: { id } });
      assertVendorAccess(session, w.vendorId);
      await db.slotWindow.update({ where: { id }, data });
      await logChange(session, w.vendorId, "slot.update", "SlotWindow", id, data);
    } else {
      const vendorId = await vendorForWrite(session);
      const created = await db.slotWindow.create({ data: { ...data, vendorId, sortOrder: startMinute } });
      await logChange(session, vendorId, "slot.create", "SlotWindow", created.id, data);
    }
    done();
  });
}
