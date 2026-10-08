import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { DomainError } from "@/server/orders/transition";
import type { Session } from "./session";

/**
 * Vendor (laundry) scoping. ADMIN and USER only ever see their own vendor.
 * SUPER_ADMIN sees every vendor, optionally narrowed by the vendor switcher
 * (a cookie) — hidden while there is only one vendor.
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

/** The super admin's switcher choice, or null for "all vendors". */
async function selectedVendorId(): Promise<string | null> {
  const value = (await cookies()).get(VENDOR_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}

/** Prisma `where` fragment limiting reads to what the session may see. */
export async function vendorWhere(
  session: Session,
): Promise<{ vendorId?: string }> {
  if (session.vendorId) return { vendorId: session.vendorId };
  const selected = await selectedVendorId();
  return selected ? { vendorId: selected } : {};
}

/**
 * The single vendor a write applies to (e.g. creating a category). A super
 * admin writes to the laundry picked in the switcher; with "All laundries"
 * selected there is no right answer, so they're asked to pick one — unless
 * only one laundry exists.
 */
export async function vendorForWrite(session: Session): Promise<string> {
  if (session.vendorId) return session.vendorId;
  const selected = await selectedVendorId();
  if (selected) return selected;
  const vendors = await listActiveVendors();
  if (vendors.length === 1) return vendors[0].id;
  throw new DomainError("Pick a laundry first");
}

/** True when `id` is an active laundry (guards the switcher cookie). */
export async function isActiveVendor(id: string): Promise<boolean> {
  return (await listActiveVendors()).some((v) => v.id === id);
}

/** The switcher's laundry for a super admin, or null ("all"). */
export async function switcherVendorId(session: Session): Promise<string | null> {
  return session.vendorId ?? (await selectedVendorId());
}

/** Throws unless the row belongs to a vendor the session may touch. */
export function assertVendorAccess(
  session: Session,
  rowVendorId: string | null | undefined,
) {
  if (session.vendorId && rowVendorId !== session.vendorId) {
    throw new Error("Not found");
  }
}
