import { getSession } from "@/server/auth/session";
import { getScope, listScopeVendors } from "@/server/auth/scope";
import { capabilitiesOf } from "@/lib/permissions";
import { ok, problem } from "@/server/api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/me — the signed-in staff member, what their role lets them
 * do, and where: the laundries they can switch between and the one the
 * switcher currently narrows to (null = all of them). See docs/ROLES.md.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return problem(401, "Not signed in");
  const [scope, laundries] = await Promise.all([getScope(session), listScopeVendors(session)]);
  return ok({
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    capabilities: capabilitiesOf(session.role),
    // null for a super admin: every laundry.
    assignedLaundryIds: scope.allowed,
    laundries: laundries.map((v) => ({ id: v.id, slug: v.slug, nameEn: v.nameEn, nameAr: v.nameAr })),
    activeLaundryId: scope.active,
  });
}
