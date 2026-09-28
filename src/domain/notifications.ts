import type { OrderStatus } from "./order-workflow";

/**
 * Which notifications a status change produces.
 *
 * Mobile kinds are the app's `NotificationKind` values (the app renders the
 * text from its own ARB catalogue; the server only sends `kind` and
 * `orderNumber`). The mapping mirrors the app's
 * `notification_mock_data_source.dart`.
 */

export type CustomerNotificationKind =
  | "driverAssigned"
  | "pickedUp"
  | "invoiceReady"
  | "processing"
  | "outForDelivery"
  | "delivered"
  | "pickupFailed"
  | "deliveryFailed"
  | "cancelled";

export type DriverNotificationKind = "newPickup" | "newDelivery";

export const STAFF_NOTIFICATION_KINDS = [
  "newOrder",
  "itemsPickedUp",
  "paymentChosen",
  "pickupFailed",
  "deliveryFailed",
  "delivered",
  "cancelled",
  "orderRated",
] as const;

export type StaffNotificationKind = (typeof STAFF_NOTIFICATION_KINDS)[number];

const CUSTOMER_KIND: Partial<Record<OrderStatus, CustomerNotificationKind>> = {
  driverAssigned: "driverAssigned",
  pickedUp: "pickedUp",
  awaitingPayment: "invoiceReady",
  processing: "processing",
  outForDelivery: "outForDelivery",
  delivered: "delivered",
  pickupFailed: "pickupFailed",
  deliveryFailed: "deliveryFailed",
  cancelled: "cancelled",
};

/**
 * @param previous the status the order left. A cancellation that follows a
 *   failed pickup doesn't notify again — the customer already got the
 *   "pickup failed, book a new time" message.
 */
export function customerKindFor(
  status: OrderStatus,
  previous?: OrderStatus,
): CustomerNotificationKind | null {
  if (status === "cancelled" && previous === "pickupFailed") return null;
  // A shop order moves straight from pickedUp to processing when the
  // laundry receives it — that is a real "cleaning started" moment.
  return CUSTOMER_KIND[status] ?? null;
}

export function driverKindFor(
  status: OrderStatus,
): DriverNotificationKind | null {
  if (status === "driverAssigned") return "newPickup";
  if (status === "outForDelivery") return "newDelivery";
  return null;
}

/** Events that need the laundry's attention in the portal. */
export function staffKindFor(
  status: OrderStatus,
  previous?: OrderStatus,
): StaffNotificationKind | null {
  switch (status) {
    case "pending":
      return "newOrder";
    case "pickedUp":
      return "itemsPickedUp";
    case "processing":
      // Only the customer's payment choice is news to staff; staff moved
      // shop orders into processing themselves.
      return previous === "awaitingPayment" ? "paymentChosen" : null;
    case "pickupFailed":
      return "pickupFailed";
    case "deliveryFailed":
      return "deliveryFailed";
    case "delivered":
      return "delivered";
    default:
      return null;
  }
}
