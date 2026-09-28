/**
 * Pickup/delivery time slots.
 *
 * A vendor defines recurring daily windows (SlotWindow). Concrete slots are
 * generated per date and identified as `YYYY-MM-DD-<windowId>`, so a booked
 * slot can be resolved again without a slots table.
 *
 * The service operates in the UAE (Asia/Dubai, UTC+4, no DST).
 */

export const UAE_OFFSET_MINUTES = 4 * 60;

export interface SlotWindowLike {
  id: string;
  startMinute: number;
  endMinute: number;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Slot {
  id: string;
  windowId: string;
  date: string;
  start: Date;
  end: Date;
  isFull: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** UTC instant of `minute` minutes after local (UAE) midnight on `date`. */
export function localMinuteToInstant(date: string, minute: number): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  return new Date(midnightUtc + (minute - UAE_OFFSET_MINUTES) * 60_000);
}

/** The UAE calendar date (YYYY-MM-DD) an instant falls on. */
export function localDateOf(instant: Date): string {
  return new Date(instant.getTime() + UAE_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function slotId(date: string, windowId: string): string {
  return `${date}-${windowId}`;
}

export function parseSlotId(
  id: string,
): { date: string; windowId: string } | null {
  const date = id.slice(0, 10);
  const windowId = id.slice(11);
  if (id[10] !== "-" || !windowId || !isIsoDate(date)) return null;
  return { date, windowId };
}

export function buildSlot(
  date: string,
  window: SlotWindowLike,
  booked: number,
): Slot {
  return {
    id: slotId(date, window.id),
    windowId: window.id,
    date,
    start: localMinuteToInstant(date, window.startMinute),
    end: localMinuteToInstant(date, window.endMinute),
    isFull: booked >= window.capacity,
  };
}

/**
 * The slots offered for `date`: active windows in order, skipping windows that
 * have already started and, for deliveries, windows that start before
 * `notBefore` (pickup time + the tier's turnaround).
 */
export function generateSlots(input: {
  date: string;
  windows: readonly SlotWindowLike[];
  bookedByWindow: ReadonlyMap<string, number>;
  now: Date;
  notBefore?: Date;
}): Slot[] {
  return [...input.windows]
    .filter((w) => w.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.startMinute - b.startMinute)
    .map((w) => buildSlot(input.date, w, input.bookedByWindow.get(w.id) ?? 0))
    .filter((s) => s.start > input.now)
    .filter((s) => !input.notBefore || s.start >= input.notBefore);
}

/** "09:00" ↔ 540 — for the portal's slot window editor. */
export function minuteToHhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}
