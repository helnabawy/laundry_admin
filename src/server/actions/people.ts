"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "@/server/db";
import { requireCapability, requireSession } from "@/server/auth/session";
import { assertVendorAccess, assignedVendorIds, vendorForWrite } from "@/server/auth/scope";
import { audit } from "@/server/orders/transition";
import { copyCatalogue } from "@/server/vendors/copy";
import { publishCatalogueChanged } from "@/server/push";
import { assignmentProblem, canAccessVendor, manageableRoles, type StaffRole } from "@/lib/permissions";
import { ActionError, run } from "./result";

// ---- Drivers ----------------------------------------------------------------

/** "50 123 4567", "0501234567", "+971501234567" → "+971501234567". */
function uaePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^971/, "").replace(/^0/, "");
  return /^5\d{8}$/.test(digits) ? `+971${digits}` : null;
}

const driverSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string(),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
});

export async function saveDriverAction(id: string | null, input: z.input<typeof driverSchema>) {
  return run(async () => {
    const session = await requireCapability("drivers.manage");
    const t = await getTranslations();
    const v = driverSchema.parse(input);
    const phone = uaePhone(v.phone);
    if (!phone) throw new ActionError(t("drivers.phoneInvalid"));
    const clash = await db.mobileUser.findUnique({ where: { phone } });
    if (clash && clash.id !== id) throw new ActionError(t("errors.phoneTaken"));
    const data = { fullName: v.fullName, phone, isActive: v.isActive, isAvailable: v.isAvailable };
    if (id) {
      const d = await db.mobileUser.findUniqueOrThrow({ where: { id } });
      assertVendorAccess(session, d.vendorId);
      await db.mobileUser.update({ where: { id }, data });
      await audit(db, { actorId: session.userId, vendorId: d.vendorId, action: "driver.update", entity: "MobileUser", entityId: id, data });
    } else {
      const vendorId = await vendorForWrite(session);
      const created = await db.mobileUser.create({ data: { ...data, role: "driver", vendorId } });
      await audit(db, { actorId: session.userId, vendorId, action: "driver.create", entity: "MobileUser", entityId: created.id, data });
    }
    revalidatePath("/drivers");
    revalidatePath("/orders");
  });
}

// ---- Staff ------------------------------------------------------------------

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]),
  /** Assigned laundries: none for SUPER_ADMIN, one for USER, one or more for ADMIN. */
  vendorIds: z.array(z.string().min(1)).max(500),
  isActive: z.boolean(),
  password: z.string().max(200).optional(),
});

/**
 * Creates or edits a staff account and its laundries. A super admin manages
 * everyone; a laundry admin manages the operators of their own laundries and
 * may only assign them to one of those.
 */
export async function saveStaffAction(id: string | null, input: z.input<typeof staffSchema>) {
  return run(async () => {
    const session = await requireCapability("staff.manage");
    const t = await getTranslations("errors");
    const v = staffSchema.parse(input);
    const roles = manageableRoles(session.role);
    if (!roles.includes(v.role as StaffRole)) throw new ActionError(t("forbidden"));
    if (v.password && v.password.length < 10) throw new ActionError(t("invalid"));
    if (!id && !v.password) throw new ActionError(t("invalid"));

    const vendorIds = [...new Set(v.vendorIds)];
    const problem = assignmentProblem(v.role, vendorIds);
    if (problem) throw new ActionError(t(`assignment.${problem}`));
    if (!vendorIds.every((vid) => canAccessVendor(session, vid))) throw new ActionError(t("forbidden"));
    const known = await db.vendor.count({ where: { id: { in: vendorIds } } });
    if (known !== vendorIds.length) throw new ActionError(t("laundryNotFound"));

    const clash = await db.staffUser.findUnique({ where: { email: v.email } });
    if (clash && clash.id !== id) throw new ActionError(t("emailTaken"));

    const data = {
      name: v.name,
      email: v.email,
      role: v.role,
      isActive: v.isActive,
      ...(v.password ? { passwordHash: await hash(v.password) } : {}),
    };
    const links = vendorIds.map((vendorId) => ({ vendorId }));
    let staffId = id;
    if (id) {
      const target = await db.staffUser.findUniqueOrThrow({ where: { id }, include: { vendors: true } });
      // Only someone who may see every laundry the target works in may edit them.
      if (!target.vendors.every((l) => canAccessVendor(session, l.vendorId))) throw new ActionError(t("forbidden"));
      if (!roles.includes(target.role)) throw new ActionError(t("forbidden"));
      if (id === session.userId && (!v.isActive || v.role !== session.role)) throw new ActionError(t("cannotDeactivateSelf"));
      await db.staffUser.update({ where: { id }, data: { ...data, vendors: { deleteMany: {}, create: links } } });
    } else {
      const created = await db.staffUser.create({
        data: { ...data, passwordHash: data.passwordHash!, vendors: { create: links } },
      });
      staffId = created.id;
    }
    await audit(db, {
      actorId: session.userId,
      vendorId: vendorIds.length === 1 ? vendorIds[0] : null,
      action: id ? "staff.update" : "staff.create",
      entity: "StaffUser",
      entityId: staffId,
      data: { name: v.name, email: v.email, role: v.role, vendorIds, isActive: v.isActive, passwordChanged: !!v.password },
    });
    revalidatePath("/staff");
  });
}

// ---- Profile ----------------------------------------------------------------

export async function updateProfileAction(input: { name: string }) {
  return run(async () => {
    const session = await requireSession();
    const name = z.string().trim().min(2).max(120).parse(input.name);
    await db.staffUser.update({ where: { id: session.userId }, data: { name } });
    revalidatePath("/", "layout");
  });
}

export async function changePasswordAction(input: { current: string; next: string }) {
  return run(async () => {
    const session = await requireSession();
    const t = await getTranslations();
    if (input.next.length < 10) throw new ActionError(t("profile.newPasswordHint"));
    const user = await db.staffUser.findUniqueOrThrow({ where: { id: session.userId } });
    if (!(await verify(user.passwordHash, input.current).catch(() => false))) throw new ActionError(t("profile.wrongPassword"));
    await db.staffUser.update({ where: { id: user.id }, data: { passwordHash: await hash(input.next) } });
    await audit(db, { actorId: user.id, vendorId: session.vendorIds.length === 1 ? session.vendorIds[0] : null, action: "staff.passwordChange", entity: "StaffUser", entityId: user.id });
  });
}

// ---- Vendors ----------------------------------------------------------------

const optionalText = z.string().trim().max(200).optional();

const vendorFields = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  addressEn: optionalText,
  addressAr: optionalText,
  city: z.string().trim().max(80).optional(),
  area: z.string().trim().max(80).optional(),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  codFee: z.coerce.number().min(0).max(1000),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/),
  isActive: z.boolean(),
});

/** A map pin needs both coordinates, or neither. */
const pinComplete = (v: { latitude: number | null; longitude: number | null }) =>
  (v.latitude === null) === (v.longitude === null);

const vendorSchema = vendorFields.refine(pinComplete, { path: ["latitude"] });

const newVendorSchema = vendorFields.extend({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
  /** Laundry whose catalogue, tiers and time windows the new one starts with. */
  copyFromId: z.string().nullable(),
}).refine(pinComplete, { path: ["latitude"] });

/** Empty optional strings are stored as null. */
function vendorData(v: z.output<typeof vendorFields>) {
  return {
    ...v,
    phone: v.phone || null,
    addressEn: v.addressEn || null,
    addressAr: v.addressAr || null,
    city: v.city || null,
    area: v.area || null,
  };
}

async function assertVendorUnique(id: string | null, slug: string | null, invoicePrefix: string) {
  const t = await getTranslations("vendors");
  const clash = await db.vendor.findFirst({
    where: { id: id ? { not: id } : undefined, OR: [{ invoicePrefix }, ...(slug ? [{ slug }] : [])] },
  });
  if (!clash) return;
  throw new ActionError(clash.invoicePrefix === invoicePrefix ? t("prefixTaken") : t("slugTaken"));
}

export async function saveVendorAction(id: string, input: z.input<typeof vendorSchema>) {
  return run(async () => {
    const session = await requireCapability("vendors.manage");
    const v = vendorSchema.parse({ ...input, invoicePrefix: String(input.invoicePrefix ?? "").toUpperCase() });
    await assertVendorUnique(id, null, v.invoicePrefix);
    await db.vendor.update({ where: { id }, data: vendorData(v) });
    await audit(db, { actorId: session.userId, vendorId: id, action: "vendor.update", entity: "Vendor", entityId: id, data: v });
    revalidatePath("/", "layout");
    void publishCatalogueChanged(id);
  });
}

export async function createVendorAction(input: z.input<typeof newVendorSchema>) {
  return run(async () => {
    const session = await requireCapability("vendors.manage");
    const v = newVendorSchema.parse({ ...input, invoicePrefix: String(input.invoicePrefix ?? "").toUpperCase() });
    await assertVendorUnique(null, v.slug, v.invoicePrefix);
    const { slug, copyFromId, ...rest } = v;
    const created = await db.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({ data: { ...vendorData(rest), slug } });
      if (copyFromId) await copyCatalogue(tx, copyFromId, vendor.id);
      return vendor;
    });
    await audit(db, {
      actorId: session.userId,
      vendorId: created.id,
      action: "vendor.create",
      entity: "Vendor",
      entityId: created.id,
      data: { ...v },
    });
    // The switcher and every laundry dropdown live in the layout.
    revalidatePath("/", "layout");
  });
}

// ---- App users (customers) ---------------------------------------------------

/**
 * Blocks or unblocks a customer. A blocked customer can't sign in to the app,
 * and any token they hold stops working on the next request.
 */
export async function setCustomerActiveAction(id: string, isActive: boolean) {
  return run(async () => {
    const session = await requireCapability("customers.manage");
    const t = await getTranslations("errors");
    // Laundry staff: customers of their laundries. Super admin: any app user.
    const vendorIds = assignedVendorIds(session);
    const customer = await db.mobileUser.findFirst({
      where: vendorIds
        ? { id, role: "customer", orders: { some: { vendorId: { in: vendorIds } } } }
        : { id },
    });
    if (!customer) throw new ActionError(t("forbidden"));
    await db.mobileUser.update({ where: { id }, data: { isActive } });
    await audit(db, {
      actorId: session.userId,
      vendorId: vendorIds?.length === 1 ? vendorIds[0] : null,
      action: isActive ? "customer.unblock" : "customer.block",
      entity: "MobileUser",
      entityId: id,
    });
    revalidatePath("/users");
    revalidatePath(`/users/${id}`);
  });
}
