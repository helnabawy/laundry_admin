import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  ORDER_STATUSES,
  PATHS,
  TRANSITIONS,
  TransitionError,
  canTransition,
  resolveTransition,
  staffActions,
  type Actor,
  type OrderKind,
  type OrderStatus,
  type TransitionId,
} from "@/domain/order-workflow";

const KINDS: OrderKind[] = ["SHOP", "WIZARD"];

/** Walks the happy path using only legal transitions. */
function walk(kind: OrderKind): OrderStatus[] {
  const steps: [TransitionId, Actor][] =
    kind === "WIZARD"
      ? [
          ["assignPickupDriver", "staff"],
          ["confirmPickup", "driver"],
          ["receiveFromDriver", "staff"],
          ["issueInvoice", "staff"],
          ["choosePaymentMethod", "customer"],
          ["markCleaned", "staff"],
          ["confirmDelivery", "driver"],
        ]
      : [
          ["assignPickupDriver", "staff"],
          ["confirmPickup", "driver"],
          ["receiveFromDriver", "staff"],
          ["markCleaned", "staff"],
          ["confirmDelivery", "driver"],
        ];
  let status: OrderStatus = "pending";
  const seen: OrderStatus[] = [status];
  for (const [id, actor] of steps) {
    status = resolveTransition(id, { status, kind }, actor);
    seen.push(status);
  }
  return seen;
}

describe("order workflow", () => {
  it.each(KINDS)("%s happy path visits exactly its PATH", (kind) => {
    expect(walk(kind)).toEqual([...PATHS[kind]]);
  });

  it("shop orders skip the facility inspection and payment wait", () => {
    expect(PATHS.SHOP).not.toContain("atFacility");
    expect(PATHS.SHOP).not.toContain("awaitingPayment");
    expect(PATHS.SHOP).toContain("processing");
  });

  it("receiving items routes by kind", () => {
    expect(resolveTransition("receiveFromDriver", { status: "pickedUp", kind: "SHOP" }, "staff")).toBe("processing");
    expect(resolveTransition("receiveFromDriver", { status: "pickedUp", kind: "WIZARD" }, "staff")).toBe("atFacility");
  });

  it("only wizard orders can be invoiced by staff", () => {
    expect(canTransition("issueInvoice", { status: "atFacility", kind: "WIZARD" })).toBe(true);
    expect(canTransition("issueInvoice", { status: "atFacility", kind: "SHOP" })).toBe(false);
  });

  it("enforces the actor", () => {
    expect(() =>
      resolveTransition("confirmPickup", { status: "driverAssigned", kind: "SHOP" }, "staff"),
    ).toThrow(TransitionError);
    expect(() =>
      resolveTransition("choosePaymentMethod", { status: "awaitingPayment", kind: "WIZARD" }, "staff"),
    ).toThrow(TransitionError);
  });

  it("rejects every transition from a status it doesn't list", () => {
    for (const [id, rule] of Object.entries(TRANSITIONS) as [TransitionId, (typeof TRANSITIONS)[TransitionId]][]) {
      for (const kind of KINDS) {
        for (const status of ORDER_STATUSES) {
          const legal = rule.from.includes(status) && rule.kinds.includes(kind);
          expect(canTransition(id, { status, kind }, rule.actor), `${id} from ${status} (${kind})`).toBe(legal);
        }
      }
    }
  });

  it("cannot cancel once out for delivery or finished", () => {
    for (const status of ["outForDelivery", "delivered", "cancelled", "pickupFailed"] as const) {
      expect(canTransition("cancel", { status, kind: "SHOP" })).toBe(false);
    }
  });

  it("offers staff only the actions valid now", () => {
    expect(staffActions({ status: "pending", kind: "SHOP" })).toEqual(["assignPickupDriver", "cancel"]);
    expect(staffActions({ status: "pickedUp", kind: "WIZARD" })).toEqual(["receiveFromDriver", "cancel"]);
    expect(staffActions({ status: "atFacility", kind: "WIZARD" })).toEqual(["issueInvoice", "cancel"]);
    expect(staffActions({ status: "awaitingPayment", kind: "WIZARD" })).toEqual(["cancel"]);
    expect(staffActions({ status: "outForDelivery", kind: "SHOP" })).toEqual([]);
    expect(staffActions({ status: "deliveryFailed", kind: "SHOP" })).toEqual(["retryDelivery", "cancel"]);
    expect(staffActions({ status: "delivered", kind: "WIZARD" })).toEqual([]);
  });

  it("board columns cover each active status exactly once", () => {
    const placed: string[] = BOARD_COLUMNS.flatMap((c) => [...c.statuses]);
    expect(new Set(placed).size).toBe(placed.length);
    for (const s of ORDER_STATUSES) {
      const terminal = ["delivered", "cancelled", "pickupFailed"].includes(s);
      expect(placed.includes(s), s).toBe(!terminal);
    }
  });
});
