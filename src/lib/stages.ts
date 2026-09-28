import {
  Ban,
  CircleCheck,
  Inbox,
  PackageOpen,
  Receipt,
  Store,
  TriangleAlert,
  Truck,
  UserRoundCheck,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import type { OrderStatus } from "@/domain/order-workflow";

/**
 * Ticket stock per status: the stage family's colour, always shown with the
 * status pictogram and label (never colour alone).
 */
export type Stock = "canary" | "pink" | "green" | "blue" | "red" | "grey";

export const STATUS_STOCK: Record<OrderStatus, Stock> = {
  pending: "canary",
  driverAssigned: "canary",
  pickedUp: "pink",
  atFacility: "pink",
  awaitingPayment: "pink",
  processing: "green",
  outForDelivery: "blue",
  delivered: "grey",
  pickupFailed: "red",
  deliveryFailed: "red",
  cancelled: "grey",
};

export const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  pending: Inbox,
  driverAssigned: UserRoundCheck,
  pickedUp: PackageOpen,
  atFacility: Store,
  awaitingPayment: Receipt,
  processing: WashingMachine,
  outForDelivery: Truck,
  delivered: CircleCheck,
  pickupFailed: TriangleAlert,
  deliveryFailed: TriangleAlert,
  cancelled: Ban,
};

/** Tailwind classes per stock, spelled out so the compiler sees them. */
export const STOCK_CLASSES: Record<
  Stock,
  { band: string; ink: string; wash: string; dot: string; border: string }
> = {
  canary: { band: "bg-canary", ink: "text-canary-ink", wash: "bg-canary-wash", dot: "bg-canary", border: "border-canary" },
  pink: { band: "bg-pink", ink: "text-pink-ink", wash: "bg-pink-wash", dot: "bg-pink", border: "border-pink" },
  green: { band: "bg-green", ink: "text-green-ink", wash: "bg-green-wash", dot: "bg-green", border: "border-green" },
  blue: { band: "bg-blue", ink: "text-blue-ink", wash: "bg-blue-wash", dot: "bg-blue", border: "border-blue" },
  red: { band: "bg-red", ink: "text-red-ink", wash: "bg-red-wash", dot: "bg-red", border: "border-red" },
  grey: { band: "bg-grey", ink: "text-grey-ink", wash: "bg-grey-wash", dot: "bg-grey", border: "border-grey" },
};

/** CSS variable for a stock (charts). */
export const STOCK_VAR: Record<Stock, { fill: string; ink: string }> = {
  canary: { fill: "var(--stock-canary)", ink: "var(--stock-canary-ink)" },
  pink: { fill: "var(--stock-pink)", ink: "var(--stock-pink-ink)" },
  green: { fill: "var(--stock-green)", ink: "var(--stock-green-ink)" },
  blue: { fill: "var(--stock-blue)", ink: "var(--stock-blue-ink)" },
  red: { fill: "var(--stock-red)", ink: "var(--stock-red-ink)" },
  grey: { fill: "var(--stock-grey)", ink: "var(--stock-grey-ink)" },
};

/**
 * How long an order may wait in a status before its ticket escalates
 * (hours). Beyond this the waiting time is set heavier, in place.
 */
export const WAIT_BUDGET_HOURS: Partial<Record<OrderStatus, number>> = {
  pending: 1,
  driverAssigned: 24,
  pickedUp: 3,
  atFacility: 6,
  awaitingPayment: 24,
  processing: 36,
  outForDelivery: 8,
  deliveryFailed: 2,
};
