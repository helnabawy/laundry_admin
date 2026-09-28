"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import { db } from "@/server/db";
import { requireCapability, requireSession } from "@/server/auth/session";
import { assertVendorAccess, vendorForWrite } from "@/server/auth/scope";
import { audit } from "@/server/orders/transition";
import { manageableRoles, type StaffRole } from "@/lib/permissions";
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
  vendorId: z.string().nullable(),
  isActive: z.boolean(),
  password: z.string().max(200).optional(),
});

export async function saveStaffAction(id: string | null, input: z.input<typeof staffSchema>) {
  return run(async () => {
    const session = await requireCapability("staff.manage");
    const t = await getTranslations("errors");
    const v = staffSchema.parse(input);
    if (!manageableRoles(session.role).includes(v.role as StaffRole)) throw new ActionError(t("forbidden"));
    if (v.password && v.password.length < 10) throw new ActionError(t("invalid"));
    if (!id && !v.password) throw new ActionError(t("invalid"));

    // Admins manage their own laundry; platform admins have no laundry.
    const vendorId = v.role === "SUPER_ADMIN" ? null : session.vendorId ?? v.vendorId ?? (await vendorForWrite(session));
    const clash = await db.staffUser.findUnique({ where: { email: v.email } });
    if (clash && clash.id !== id) throw new ActionError(t("emailTaken"));

    const data = {
      name: v.name,
      email: v.email,
      role: v.role,
      vendorId,
      isActive: v.isActive,
      ...(v.password ? { passwordHash: await hash(v.password) } : {}),
    };
    if (id) {
      const target = await db.staffUser.findUniqueOrThrow({ where: { id } });
      if (session.vendorId && target.vendorId !== session.vendorId) throw new ActionError(t("forbidden"));
      if (!manageableRoles(session.role).includes(target.role)) throw new ActionError(t("forbidden"));
      if (id === session.userId && (!v.isActive || v.role !== session.role)) throw new ActionError(t("cannotDeactivateSelf"));
      await db.staffUser.update({ where: { id }, data });
    } else {
      await db.staffUser.create({ data: { ...data, passwordHash: data.passwordHash! } });
    }
    await audit(db, {
      actorId: session.userId,
      vendorId,
      action: id ? "staff.update" : "staff.create",
      entity: "StaffUser",
      entityId: id,
      data: { name: v.name, email: v.email, role: v.role, isActive: v.isActive, passwordChanged: !!v.password },
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
    await audit(db, { actorId: user.id, vendorId: user.vendorId, action: "staff.passwordChange", entity: "StaffUser", entityId: user.id });
  });
}

// ---- Vendors ----------------------------------------------------------------

const vendorSchema = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  codFee: z.coerce.number().min(0).max(1000),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/),
  isActive: z.boolean(),
});

export async function saveVendorAction(id: string, input: z.input<typeof vendorSchema>) {
  return run(async () => {
    const session = await requireCapability("vendors.manage");
    const v = vendorSchema.parse({ ...input, invoicePrefix: String(input.invoicePrefix ?? "").toUpperCase() });
    await db.vendor.update({ where: { id }, data: { ...v, phone: v.phone || null } });
    await audit(db, { actorId: session.userId, vendorId: id, action: "vendor.update", entity: "Vendor", entityId: id, data: v });
    revalidatePath("/vendors");
  });
}
