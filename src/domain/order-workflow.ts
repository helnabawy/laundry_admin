/**
 * The order lifecycle, shared by the Admin Portal and the mobile API.
 *
 * One status enum serves both booking paths, but each path only visits a
 * subset of it (see PRODUCT.md → Order lifecycle):
 *
 *   Wizard: pending → driverAssigned → pickedUp → atFacility → awaitingPayment
 *           → processing → outForDelivery → delivered
 *   Shop:   pending → driverAssigned → pickedUp → processing
 *           → outForDelivery → delivered
 *
 * Terminal/failure states for both: pickupFailed (→ cancelled),
 * deliveryFailed (→ retried by staff), cancelled.
 *
 * Pure module: no I/O, so every rule here is unit-tested.
 */

export const ORDER_STATUSES = [
  "pending",
  "driverAssigned",
  "pickedUp",
  "atFacility",
  "awaitingPayment",
  "processing",
  "outForDelivery",
  "delivered",
  "pickupFailed",
  "deliveryFailed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderKind = "SHOP" | "WIZARD";
export type Actor = "staff" | "driver" | "customer" | "system";

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "delivered",
  "cancelled",
];

export const FAILURE_STATUSES: readonly OrderStatus[] = [
  "pickupFailed",
  "deliveryFailed",
];

export function isActive(status: OrderStatus): boolean {
  return !TERMINAL_STATUSES.includes(status) && status !== "pickupFailed";
}

/** The happy path each kind of order walks, in order. */
export const PATHS: Record<OrderKind, readonly OrderStatus[]> = {
  WIZARD: [
    "pending",
    "driverAssigned",
    "pickedUp",
    "atFacility",
    "awaitingPayment",
    "processing",
    "outForDelivery",
    "delivered",
  ],
  SHOP: [
    "pending",
    "driverAssigned",
    "pickedUp",
    "processing",
    "outForDelivery",
    "delivered",
  ],
};

/**
 * Named transitions. Each names who may perform it, which statuses it starts
 * from, and where it goes. `to` may depend on the order kind.
 */
export type TransitionId =
  | "assignPickupDriver"
  | "reassignPickupDriver"
  | "confirmPickup"
  | "reportPickupFailed"
  | "receiveFromDriver"
  | "issueInvoice"
  | "choosePaymentMethod"
  | "markCleaned"
  | "confirmDelivery"
  | "reportDeliveryFailed"
  | "retryDelivery"
  | "cancel";

interface TransitionRule {
  actor: Actor;
  from: readonly OrderStatus[];
  kinds: readonly OrderKind[];
  to: (kind: OrderKind) => OrderStatus;
}

const BOTH: readonly OrderKind[] = ["SHOP", "WIZARD"];

export const TRANSITIONS: Record<TransitionId, TransitionRule> = {
  assignPickupDriver: {
    actor: "staff",
    from: ["pending"],
    kinds: BOTH,
    to: () => "driverAssigned",
  },
  // Swapping the pickup driver before the pickup happens keeps the status.
  reassignPickupDriver: {
    actor: "staff",
    from: ["driverAssigned"],
    kinds: BOTH,
    to: () => "driverAssigned",
  },
  confirmPickup: {
    actor: "driver",
    from: ["driverAssigned"],
    kinds: BOTH,
    to: () => "pickedUp",
  },
  reportPickupFailed: {
    actor: "driver",
    from: ["driverAssigned"],
    kinds: BOTH,
    to: () => "pickupFailed",
  },
  // The laundry confirms the driver handed the items over. A shop order's
  // price is already settled, so it goes straight into the wash.
  receiveFromDriver: {
    actor: "staff",
    from: ["pickedUp"],
    kinds: BOTH,
    to: (kind) => (kind === "SHOP" ? "processing" : "atFacility"),
  },
  issueInvoice: {
    actor: "staff",
    from: ["atFacility"],
    kinds: ["WIZARD"],
    to: () => "awaitingPayment",
  },
  choosePaymentMethod: {
    actor: "customer",
    from: ["awaitingPayment"],
    kinds: ["WIZARD"],
    to: () => "processing",
  },
  // Cleaning done → hand to the delivery driver.
  markCleaned: {
    actor: "staff",
    from: ["processing"],
    kinds: BOTH,
    to: () => "outForDelivery",
  },
  confirmDelivery: {
    actor: "driver",
    from: ["outForDelivery"],
    kinds: BOTH,
    to: () => "delivered",
  },
  reportDeliveryFailed: {
    actor: "driver",
    from: ["outForDelivery"],
    kinds: BOTH,
    to: () => "deliveryFailed",
  },
  retryDelivery: {
    actor: "staff",
    from: ["deliveryFailed"],
    kinds: BOTH,
    to: () => "outForDelivery",
  },
  cancel: {
    actor: "staff",
    from: [
      "pending",
      "driverAssigned",
      "pickedUp",
      "atFacility",
      "awaitingPayment",
      "processing",
      "deliveryFailed",
    ],
    kinds: BOTH,
    to: () => "cancelled",
  },
};

export class TransitionError extends Error {
  constructor(
    readonly transition: TransitionId,
    readonly status: OrderStatus,
    readonly kind: OrderKind,
    message?: string,
  ) {
    super(
      message ??
        `Cannot ${transition} an order that is ${status} (${kind.toLowerCase()})`,
    );
    this.name = "TransitionError";
  }
}

export function canTransition(
  id: TransitionId,
  order: { status: OrderStatus; kind: OrderKind },
  actor?: Actor,
): boolean {
  const rule = TRANSITIONS[id];
  if (actor && rule.actor !== actor) return false;
  return rule.from.includes(order.status) && rule.kinds.includes(order.kind);
}

/** Returns the status the order moves to, or throws [TransitionError]. */
export function resolveTransition(
  id: TransitionId,
  order: { status: OrderStatus; kind: OrderKind },
  actor: Actor,
): OrderStatus {
  const rule = TRANSITIONS[id];
  if (rule.actor !== actor) {
    throw new TransitionError(
      id,
      order.status,
      order.kind,
      `${actor} cannot ${id}`,
    );
  }
  if (!canTransition(id, order)) {
    throw new TransitionError(id, order.status, order.kind);
  }
  return rule.to(order.kind);
}

/** The staff actions valid for this order right now, primary first. */
export function staffActions(order: {
  status: OrderStatus;
  kind: OrderKind;
}): TransitionId[] {
  const order_: TransitionId[] = [
    "assignPickupDriver",
    "receiveFromDriver",
    "issueInvoice",
    "markCleaned",
    "retryDelivery",
    "reassignPickupDriver",
    "cancel",
  ];
  return order_.filter((id) => canTransition(id, order, "staff"));
}

/**
 * Where the order sits on its path's progress strip, 0-based, or -1 when it is
 * off the happy path (failed / cancelled).
 */
export function pathIndex(kind: OrderKind, status: OrderStatus): number {
  return PATHS[kind].indexOf(status);
}

/** Operational board columns (portal). Each status lands in exactly one. */
export const BOARD_COLUMNS = [
  { id: "new", statuses: ["pending"] },
  { id: "assigned", statuses: ["driverAssigned"] },
  { id: "handover", statuses: ["pickedUp"] },
  { id: "atFacility", statuses: ["atFacility"] },
  { id: "awaitingPayment", statuses: ["awaitingPayment"] },
  { id: "processing", statuses: ["processing"] },
  { id: "outForDelivery", statuses: ["outForDelivery"] },
  { id: "issues", statuses: ["deliveryFailed"] },
] as const satisfies readonly { id: string; statuses: readonly OrderStatus[] }[];

export type BoardColumnId = (typeof BOARD_COLUMNS)[number]["id"];
