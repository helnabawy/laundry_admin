import "server-only";
import { db } from "@/server/db";
import { buildSlot, generateSlots, parseSlotId, type Slot } from "@/domain/slots";

export type SlotType = "pickup" | "delivery";

async function bookedCounts(
  vendorId: string,
  date: string,
  type: SlotType,
): Promise<Map<string, number>> {
  const column = type === "pickup" ? "pickupSlotId" : "deliverySlotId";
  const rows = await db.order.groupBy({
    by: [column],
    where: {
      vendorId,
      status: { notIn: ["cancelled", "pickupFailed"] },
      [column]: { startsWith: `${date}-` },
    },
    _count: { _all: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const parsed = parseSlotId(row[column] as string);
    if (parsed) counts.set(parsed.windowId, row._count._all);
  }
  return counts;
}

export async function slotsFor(input: {
  vendorId: string;
  date: string;
  type: SlotType;
  notBefore?: Date;
  now?: Date;
}): Promise<Slot[]> {
  const [windows, booked] = await Promise.all([
    db.slotWindow.findMany({ where: { vendorId: input.vendorId } }),
    bookedCounts(input.vendorId, input.date, input.type),
  ]);
  return generateSlots({
    date: input.date,
    windows,
    bookedByWindow: booked,
    now: input.now ?? new Date(),
    notBefore: input.notBefore,
  });
}

/** Resolves a slot id the app sent back; null when it no longer exists. */
export async function resolveSlot(
  vendorId: string,
  id: string,
  type: SlotType,
): Promise<Slot | null> {
  const parsed = parseSlotId(id);
  if (!parsed) return null;
  const window = await db.slotWindow.findFirst({
    where: { id: parsed.windowId, vendorId, isActive: true },
  });
  if (!window) return null;
  const booked = await bookedCounts(vendorId, parsed.date, type);
  return buildSlot(parsed.date, window, booked.get(window.id) ?? 0);
}
