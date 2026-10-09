import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/server/orders/transition";
import { canAccessVendor } from "@/lib/permissions";
import type { Session } from "./session";

/**
 * Vendor (laundry) scoping — the one place that decides which laundries a
 * portal request may read or write. See `docs/ROLES.md`.
 *
 * - SUPER_ADMIN sees every laundry, optionally narrowed by the switcher.
 * - ADMIN (laundry admin) sees the laundries they're assigned to: all of them
 *   ("All my laundries", the default) or one picked in the switcher.
 * - USER (laundry operator) sees their one laundry.
 *
 * The switcher is a cookie, so it's only ever a *narrowing* hint: it is
 * checked against the assignments on every request and ignored when it names
 * a laundry outside them.
 */

export const VENDOR_COOKIE = "laundry_admin_vendor";

export const listActiveVendors = cache(() =>
  db.vendor.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, nameEn: true, nameAr: true },
  }),
);

/** Header the mobile app sends with the laundry the customer picked. */
export const VENDOR_HEADER = "x-vendor-id";

/**
 * The laundry a mobile API request is for: the `X-Vendor-Id` header (or a
 * `?vendor=` query parameter), matched by id or slug. Older app builds send
 * neither and get the default laundry. A named laundry that doesn't exist or
 * has stopped accepting orders is a 404, never a silent fallback.
 */
export async function requestVendor(req: Request) {
  const named =
    req.headers.get(VENDOR_HEADER)?.trim() ||
    new URL(req.url).searchParams.get("vendor")?.trim();
  if (!named) return defaultVendor();
  const vendor = await db.vendor.findFirst({
    where: { isActive: true, OR: [{ id: named }, { slug: named }] },
  });
  if (!vendor) throw new DomainError("Laundry not found", 404);
  return vendor;
}

/** The vendor the mobile API serves when a request doesn't name one. */
export const defaultVendor = cache(async () => {
  const slug = process.env.DEFAULT_VENDOR_SLUG;
  const vendor = slug
    ? await db.vendor.findUnique({ where: { slug } })
    : await db.vendor.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
  if (!vendor) throw new Error("No active vendor — run `pnpm db:seed`.");
  return vendor;
});

export interface Scope {
  /** Laundries this person may see; null = every laundry (super admin). */
  allowed: string[] | null;
  /** The one laundry being looked at, always within `allowed`; null = all of them. */
  active: string | null;
}

/** The scope of this request: the session's laundries plus the switcher. */
export const getScope = cache(async (session: Session): Promise<Scope> => {
  const picked = (await cookies()).get(VENDOR_COOKIE)?.value;
  const choice = picked && picked !== "all" ? picked : null;
  if (session.role === "SUPER_ADMIN") {
    return { allowed: null, active: choice && (await isActiveVendor(choice)) ? choice : null };
  }
  const allowed = session.vendorIds;
  if (allowed.length === 1) return { allowed, active: allowed[0] };
  return { allowed, active: choice && allowed.includes(choice) ? choice : null };
});

/** The `where` fragment `vendorWhere` returns. */
export type VendorScope = { vendorId?: string | { in: string[] } };

/**
 * Every laundry the session is assigned to, ignoring the switcher; null for a
 * super admin (all). For views that deliberately don't follow the switcher.
 */
export function assignedVendorIds(session: Session): string[] | null {
  return session.role === "SUPER_ADMIN" ? null : session.vendorIds;
}

/**
 * The laundries a read covers: the switcher's one, or everything allowed.
 * null = no filter at all (super admin on "All laundries").
 */
export async function scopeVendorIds(session: Session): Promise<string[] | null> {
  const { allowed, active } = await getScope(session);
  return active ? [active] : allowed;
}

/**
 * Prisma `where` fragment limiting reads to what the session may see. Deny by
 * default: anyone but a super admin always gets a filter, even with no
 * laundries assigned (an empty `in` matches nothing).
 */
export async function vendorWhere(session: Session): Promise<VendorScope> {
  const ids = await scopeVendorIds(session);
  if (ids === null) return {};
  return ids.length === 1 ? { vendorId: ids[0] } : { vendorId: { in: ids } };
}

/**
 * The same filter as `vendorWhere`, as a SQL fragment for raw queries:
 * `AND <column> = ANY(...)`, or nothing for an unfiltered super admin.
 */
export async function vendorSql(session: Session, column: Prisma.Sql): Promise<Prisma.Sql> {
  const ids = await scopeVendorIds(session);
  return ids === null ? Prisma.empty : Prisma.sql`AND ${column} = ANY(${ids})`;
}

/**
 * The single vendor a write applies to (e.g. creating a category): the
 * laundry picked in the switcher, or the only one the person has. Looking at
 * several laundries there is no right answer, so they're asked to pick one.
 */
export async function vendorForWrite(session: Session): Promise<string> {
  const id = await singleVendorId(session);
  if (!id) throw new DomainError("Pick a laundry first");
  return id;
}

/**
 * The one laundry being worked on, or null when the view spans several:
 * the switcher's laundry, the person's only laundry, or the platform's only
 * laundry. Pages that edit per-laundry settings ask to pick one on null.
 */
export async function singleVendorId(session: Session): Promise<string | null> {
  const { allowed, active } = await getScope(session);
  if (active) return active;
  if (allowed === null) {
    const vendors = await listActiveVendors();
    if (vendors.length === 1) return vendors[0].id;
  }
  return null;
}

/** True when `id` is an active laundry (guards the switcher cookie). */
export async function isActiveVendor(id: string): Promise<boolean> {
  return (await listActiveVendors()).some((v) => v.id === id);
}

/** The switcher's laundry, or null when looking at several ("all"). */
export async function switcherVendorId(session: Session): Promise<string | null> {
  return (await getScope(session)).active;
}

/** True when the current view covers more than one laundry (show a "Laundry" column). */
export async function spansLaundries(session: Session): Promise<boolean> {
  const ids = await scopeVendorIds(session);
  return ids === null || ids.length > 1;
}

/**
 * The laundries this person can switch between and pick in forms: every
 * active laundry for a super admin, their own laundries otherwise.
 */
export async function listScopeVendors(session: Session) {
  if (session.role === "SUPER_ADMIN") return listActiveVendors();
  return db.vendor.findMany({
    where: { id: { in: session.vendorIds } },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, nameEn: true, nameAr: true },
  });
}

/** Throws unless the row belongs to a vendor the session may touch. */
export function assertVendorAccess(
  session: Session,
  rowVendorId: string | null | undefined,
) {
  if (!canAccessVendor(session, rowVendorId)) {
    throw new Error("Not found");
  }
}
