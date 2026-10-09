import { describe, expect, it } from "vitest";
import { assignmentProblem, can, manageableRoles } from "@/lib/permissions";

describe("permissions", () => {
  it("reports and audit are super-admin only", () => {
    expect(can("SUPER_ADMIN", "reports.view")).toBe(true);
    expect(can("ADMIN", "reports.view")).toBe(false);
    expect(can("USER", "reports.view")).toBe(false);
    expect(can("ADMIN", "audit.view")).toBe(false);
  });

  it("the Drivers page belongs to laundry admins, not the super admin", () => {
    expect(can("ADMIN", "drivers.manage")).toBe(true);
    expect(can("SUPER_ADMIN", "drivers.manage")).toBe(false);
    expect(can("USER", "drivers.manage")).toBe(false);
  });

  it("app users are managed by admins and the super admin, not operators", () => {
    expect(can("SUPER_ADMIN", "customers.manage")).toBe(true);
    expect(can("ADMIN", "customers.manage")).toBe(true);
    expect(can("USER", "customers.manage")).toBe(false);
  });

  it("operators work orders but can't cancel or manage", () => {
    expect(can("USER", "orders.operate")).toBe(true);
    expect(can("USER", "orders.cancel")).toBe(false);
    expect(can("USER", "catalogue.manage")).toBe(false);
    expect(can("USER", "staff.manage")).toBe(false);
  });

  it("admins manage their laundries but not vendors", () => {
    expect(can("ADMIN", "catalogue.manage")).toBe(true);
    expect(can("ADMIN", "drivers.manage")).toBe(true);
    expect(can("ADMIN", "vendors.manage")).toBe(false);
  });

  it("the super admin manages every staff role; a laundry admin only operators", () => {
    expect(can("SUPER_ADMIN", "staff.manage")).toBe(true);
    expect(can("ADMIN", "staff.manage")).toBe(true);
    expect(manageableRoles("SUPER_ADMIN")).toEqual(["SUPER_ADMIN", "ADMIN", "USER"]);
    expect(manageableRoles("ADMIN")).toEqual(["USER"]);
    expect(manageableRoles("USER")).toEqual([]);
  });

  it("a super admin has no laundries, an operator exactly one, an admin one or more", () => {
    expect(assignmentProblem("SUPER_ADMIN", [])).toBeNull();
    expect(assignmentProblem("SUPER_ADMIN", ["a"])).toBe("noneAllowed");
    expect(assignmentProblem("USER", ["a"])).toBeNull();
    expect(assignmentProblem("USER", [])).toBe("exactlyOne");
    expect(assignmentProblem("USER", ["a", "b"])).toBe("exactlyOne");
    expect(assignmentProblem("USER", ["a", "a"])).toBeNull();
    expect(assignmentProblem("ADMIN", ["a"])).toBeNull();
    expect(assignmentProblem("ADMIN", ["a", "b", "c"])).toBeNull();
    expect(assignmentProblem("ADMIN", [])).toBe("atLeastOne");
  });

  it("finance and refunds belong to laundry owners and the super admin, not operators", () => {
    for (const capability of ["finance.view", "finance.manage", "payments.refund"] as const) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
      expect(can("ADMIN", capability)).toBe(true);
      expect(can("USER", capability)).toBe(false);
    }
  });
});
