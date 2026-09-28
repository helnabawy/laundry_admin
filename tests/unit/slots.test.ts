import { describe, expect, it } from "vitest";
import {
  generateSlots,
  hhmmToMinute,
  localDateOf,
  localMinuteToInstant,
  minuteToHhmm,
  parseSlotId,
  slotId,
} from "@/domain/slots";

const windows = [
  { id: "win-0900", startMinute: 540, endMinute: 660, capacity: 2, isActive: true, sortOrder: 0 },
  { id: "win-1600", startMinute: 960, endMinute: 1080, capacity: 2, isActive: true, sortOrder: 1 },
  { id: "win-off", startMinute: 1200, endMinute: 1260, capacity: 2, isActive: false, sortOrder: 2 },
];

describe("slots", () => {
  it("converts UAE local time to UTC", () => {
    expect(localMinuteToInstant("2026-10-01", 540).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(localDateOf(new Date("2026-09-30T21:00:00Z"))).toBe("2026-10-01");
  });

  it("round-trips slot ids, including window ids with dashes", () => {
    const id = slotId("2026-10-01", "win-0900");
    expect(id).toBe("2026-10-01-win-0900");
    expect(parseSlotId(id)).toEqual({ date: "2026-10-01", windowId: "win-0900" });
    expect(parseSlotId("nonsense")).toBeNull();
    expect(parseSlotId("2026-13-45-win")).toBeNull();
  });

  it("skips inactive, started and too-early windows; marks full", () => {
    const slots = generateSlots({
      date: "2026-10-01",
      windows,
      bookedByWindow: new Map([["win-1600", 2]]),
      now: new Date("2026-09-30T00:00:00Z"),
    });
    expect(slots.map((s) => s.windowId)).toEqual(["win-0900", "win-1600"]);
    expect(slots.map((s) => s.isFull)).toEqual([false, true]);

    const later = generateSlots({
      date: "2026-10-01",
      windows,
      bookedByWindow: new Map(),
      now: new Date("2026-10-01T06:00:00Z"), // 10:00 local — the 09:00 window started
    });
    expect(later.map((s) => s.windowId)).toEqual(["win-1600"]);

    const notBefore = generateSlots({
      date: "2026-10-01",
      windows,
      bookedByWindow: new Map(),
      now: new Date("2026-09-01T00:00:00Z"),
      notBefore: new Date("2026-10-01T10:00:00Z"),
    });
    expect(notBefore.map((s) => s.windowId)).toEqual(["win-1600"]);
  });

  it("parses HH:MM", () => {
    expect(hhmmToMinute("09:30")).toBe(570);
    expect(hhmmToMinute("24:00")).toBe(1440);
    expect(hhmmToMinute("25:00")).toBeNull();
    expect(minuteToHhmm(570)).toBe("09:30");
  });
});
