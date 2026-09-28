import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
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
 * admin writes to the switcher's vendor, or the default one.
 */
export async function vendorForWrite(session: Session): Promise<string> {
  if (session.vendorId) return session.vendorId;
  return (await selectedVendorId()) ?? (await defaultVendor()).id;
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
