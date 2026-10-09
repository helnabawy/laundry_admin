/**
 * Portal roles and what each may do. Pure, so both server checks and the
 * client navigation read the same matrix.
 *
 * - SUPER_ADMIN — super admin, platform operator: every laundry, staff
 *                 accounts, reports, audit log.
 * - ADMIN       — laundry admin: runs the laundries a super admin assigned
 *                 them (one or more): catalogue, drivers, app users, orders,
 *                 their operators, and the money (income, refunds, expenses).
 * - USER        — laundry operator: works one laundry's orders day to day.
 *
 * Roles decide *what* someone may do; laundry assignments (`StaffVendor`)
 * decide *where* — see `src/server/auth/scope.ts` and `docs/ROLES.md`.
 */

export type StaffRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export const STAFF_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "ADMIN", "USER"];

export type Capability =
  | "dashboard.view"
  | "orders.view"
  | "orders.operate"
  | "orders.cancel"
  | "catalogue.manage"
  | "drivers.manage"
  | "customers.manage"
  | "staff.manage"
  | "vendors.manage"
  | "reports.view"
  | "audit.view"
  | "finance.view"
  | "finance.manage"
  | "payments.refund";

const MATRIX: Record<StaffRole, readonly Capability[]> = {
  SUPER_ADMIN: [
    "dashboard.view",
    "orders.view",
    "orders.operate",
    "orders.cancel",
    "catalogue.manage",
    "customers.manage",
    "staff.manage",
    "vendors.manage",
    "reports.view",
    "audit.view",
    "finance.view",
    "finance.manage",
    "payments.refund",
  ],
  ADMIN: [
    "dashboard.view",
    "orders.view",
    "orders.operate",
    "orders.cancel",
    "catalogue.manage",
    "drivers.manage",
    "customers.manage",
    "staff.manage",
    "finance.view",
    "finance.manage",
    "payments.refund",
  ],
  USER: ["dashboard.view", "orders.view", "orders.operate"],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** Everything `role` may do. */
export function capabilitiesOf(role: StaffRole): readonly Capability[] {
  return MATRIX[role];
}

/**
 * Roles a user of `role` may create or edit. A laundry admin manages the
 * operators of their own laundries; only the super admin manages admins.
 */
export function manageableRoles(role: StaffRole): StaffRole[] {
  if (role === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", "USER"];
  if (role === "ADMIN") return ["USER"];
  return [];
}

export type AssignmentProblem = "noneAllowed" | "exactlyOne" | "atLeastOne";

/**
 * How many laundries a role is assigned to: a super admin none (platform-wide),
 * a laundry admin one or more, a laundry operator exactly one. Returns the
 * rule broken, or null when `vendorIds` fits the role.
 */
export function assignmentProblem(role: StaffRole, vendorIds: readonly string[]): AssignmentProblem | null {
  const count = new Set(vendorIds).size;
  if (role === "SUPER_ADMIN") return count === 0 ? null : "noneAllowed";
  if (role === "USER") return count === 1 ? null : "exactlyOne";
  return count >= 1 ? null : "atLeastOne";
}

/** Who a laundry-access check is about: a session, or a staff actor. */
export interface LaundryMember {
  role: StaffRole;
  /** Assigned laundries; ignored for SUPER_ADMIN, who may access any. */
  vendorIds: readonly string[];
}

/** True when `member` may read or write rows of laundry `vendorId`. */
export function canAccessVendor(member: LaundryMember, vendorId: string | null | undefined): boolean {
  if (member.role === "SUPER_ADMIN") return true;
  return !!vendorId && member.vendorIds.includes(vendorId);
}

export function isPlatformRole(role: StaffRole): boolean {
  return role === "SUPER_ADMIN";
}
