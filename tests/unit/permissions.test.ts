import { describe, expect, it } from "vitest";
import { can, manageableRoles } from "@/lib/permissions";

describe("permissions", () => {
  it("reports and audit are super-admin only", () => {
    expect(can("SUPER_ADMIN", "reports.view")).toBe(true);
    expect(can("ADMIN", "reports.view")).toBe(false);
    expect(can("USER", "reports.view")).toBe(false);
    expect(can("ADMIN", "audit.view")).toBe(false);
  });

  it("operators work orders but can't cancel or manage", () => {
    expect(can("USER", "orders.operate")).toBe(true);
    expect(can("USER", "orders.cancel")).toBe(false);
    expect(can("USER", "catalogue.manage")).toBe(false);
    expect(can("USER", "staff.manage")).toBe(false);
  });

  it("admins manage their laundry but not vendors", () => {
    expect(can("ADMIN", "catalogue.manage")).toBe(true);
    expect(can("ADMIN", "drivers.manage")).toBe(true);
    expect(can("ADMIN", "vendors.manage")).toBe(false);
  });

  it("admins can't mint super admins", () => {
    expect(manageableRoles("ADMIN")).toEqual(["ADMIN", "USER"]);
    expect(manageableRoles("USER")).toEqual([]);
  });
});
