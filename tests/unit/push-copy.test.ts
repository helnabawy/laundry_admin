import { describe, expect, it } from "vitest";
import { pushCopy, vendorTopic } from "@/domain/push-copy";
import { STAFF_NOTIFICATION_KINDS } from "@/domain/notifications";

const MOBILE_KINDS = [
  "driverAssigned",
  "pickedUp",
  "invoiceReady",
  "processing",
  "outForDelivery",
  "delivered",
  "pickupFailed",
  "deliveryFailed",
  "cancelled",
  "newPickup",
  "newDelivery",
];

describe("push copy", () => {
  it("has a title and a body with the order number for every mobile kind, in both languages", () => {
    for (const kind of MOBILE_KINDS) {
      for (const lang of ["en", "ar"] as const) {
        const { title, body } = pushCopy(lang, kind, 1042);
        expect(title).not.toBe(pushCopy(lang, "update", 1).title);
        expect(body).toContain("1042");
      }
    }
  });

  it("falls back to a generic update for an unknown kind", () => {
    expect(pushCopy("en", STAFF_NOTIFICATION_KINDS[0], 7)).toEqual({ title: "Order update", body: "Order 7 has a new status." });
  });

  it("builds a valid FCM topic name per laundry", () => {
    expect(vendorTopic("fac-1")).toBe("vendor-fac-1");
    expect(vendorTopic("a b/c")).toMatch(/^[a-zA-Z0-9_.~%-]+$/);
  });
});
