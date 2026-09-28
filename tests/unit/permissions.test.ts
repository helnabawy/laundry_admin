import { describe, expect, it } from "vitest";
import { can, manageableRoles } from "@/lib/permissions";

describe("permissions", () => {
  it("reports and audit are super-admin only", () => {
    expect(can("SUPER_ADMIN", "reports.view")).toBe(true);
    expect(can("ADMIN", "reports.view")).toBe(false);
    expect(can("USER", "reports.view")).toBe(false);
    expect(can("ADMIN", "audit.view")).toBe(false);
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

  it("admins manage their laundry but not vendors or staff", () => {
    expect(can("ADMIN", "catalogue.manage")).toBe(true);
    expect(can("ADMIN", "drivers.manage")).toBe(true);
    expect(can("ADMIN", "vendors.manage")).toBe(false);
    expect(can("ADMIN", "staff.manage")).toBe(false);
  });

  it("only the super admin manages staff accounts", () => {
    expect(can("SUPER_ADMIN", "staff.manage")).toBe(true);
    expect(manageableRoles("SUPER_ADMIN")).toEqual(["SUPER_ADMIN", "ADMIN", "USER"]);
    expect(manageableRoles("ADMIN")).toEqual([]);
    expect(manageableRoles("USER")).toEqual([]);
  });
});
