/**
 * Portal roles and what each may do. Pure, so both server checks and the
 * client navigation read the same matrix.
 *
 * - SUPER_ADMIN — platform operator: every vendor, staff accounts, reports,
 *                 audit log.
 * - ADMIN       — runs one laundry: catalogue, drivers, orders.
 * - USER        — laundry operator: works orders day to day.
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
  | "staff.manage"
  | "vendors.manage"
  | "reports.view"
  | "audit.view";

const MATRIX: Record<StaffRole, readonly Capability[]> = {
  SUPER_ADMIN: [
    "dashboard.view",
    "orders.view",
    "orders.operate",
    "orders.cancel",
    "catalogue.manage",
    "drivers.manage",
    "staff.manage",
    "vendors.manage",
    "reports.view",
    "audit.view",
  ],
  ADMIN: [
    "dashboard.view",
    "orders.view",
    "orders.operate",
    "orders.cancel",
    "catalogue.manage",
    "drivers.manage",
  ],
  USER: ["dashboard.view", "orders.view", "orders.operate"],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** Roles a user of `role` may create or edit. */
export function manageableRoles(role: StaffRole): StaffRole[] {
  if (role === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", "USER"];
  return [];
}

export function isPlatformRole(role: StaffRole): boolean {
  return role === "SUPER_ADMIN";
}
