import { describe, expect, it } from "vitest";
import { customerKindFor, driverKindFor, staffKindFor } from "@/domain/notifications";

describe("notification mapping", () => {
  it("matches the app's customer mapping", () => {
    expect(customerKindFor("pending")).toBeNull();
    expect(customerKindFor("atFacility")).toBeNull();
    expect(customerKindFor("awaitingPayment")).toBe("invoiceReady");
    expect(customerKindFor("outForDelivery")).toBe("outForDelivery");
    expect(customerKindFor("cancelled", "pickupFailed")).toBeNull();
    expect(customerKindFor("cancelled", "pending")).toBe("cancelled");
  });

  it("drivers hear about new pickups and deliveries", () => {
    expect(driverKindFor("driverAssigned")).toBe("newPickup");
    expect(driverKindFor("outForDelivery")).toBe("newDelivery");
    expect(driverKindFor("processing")).toBeNull();
  });

  it("staff hear about new orders, handovers, payments and failures", () => {
    expect(staffKindFor("pending")).toBe("newOrder");
    expect(staffKindFor("pickedUp")).toBe("itemsPickedUp");
    expect(staffKindFor("processing", "awaitingPayment")).toBe("paymentChosen");
    expect(staffKindFor("processing", "pickedUp")).toBeNull();
    expect(staffKindFor("deliveryFailed")).toBe("deliveryFailed");
  });
});
