import { describe, expect, it, vi } from "vitest";
import { businessDate, businessDay } from "@/lib/time";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { addDays, dayRange, nicosiaInstant } = await import("@/modules/minibar/server/dates");
const { getBusinessDate } = await import("@/modules/minibar/server/minibarCommon");
const { checkUploadScheduleWindow } = await import("@/modules/minibar/server/occupancyUpload");

describe("minibar iş günü (Europe/Nicosia)", () => {
  it("01:00 yerel saatte iş günü UTC gününden bir ileridir (yaz, UTC+3)", () => {
    // 2026-07-10T22:00Z is 2026-07-11 01:00 in Nicosia
    const at = new Date("2026-07-10T22:00:00.000Z");
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(businessDate(at)).toBe("2026-07-11");
    expect(getBusinessDate(at).toISOString()).toBe("2026-07-11T00:00:00.000Z");
    expect(getBusinessDate(at).getTime()).toBe(businessDay("2026-07-11").getTime());
  });

  it("kış saatinde (UTC+2) 01:00 yerel = 23:00Z önceki gün", () => {
    const at = new Date("2026-01-10T23:00:00.000Z");
    expect(businessDate(at)).toBe("2026-01-11");
    expect(getBusinessDate(at).toISOString()).toBe("2026-01-11T00:00:00.000Z");
  });

  it("gece yarısından hemen önce hala aynı iş günüdür", () => {
    expect(businessDate(new Date("2026-07-10T20:59:59.000Z"))).toBe("2026-07-10"); // 23:59:59 local
    expect(businessDate(new Date("2026-07-10T21:00:00.000Z"))).toBe("2026-07-11"); // 00:00 local
  });

  it("dayRange yerel gün sınırlarını UTC anı olarak verir", () => {
    const r = dayRange("2026-07-11");
    expect(r.gte.toISOString()).toBe("2026-07-10T21:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2026-07-11T21:00:00.000Z");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("nicosiaInstant yerel saat metnini mutlak ana çevirir", () => {
    expect(nicosiaInstant("2026-07-10", "14:30")?.toISOString()).toBe("2026-07-10T11:30:00.000Z");
    expect(nicosiaInstant("2026-01-10", "14:30")?.toISOString()).toBe("2026-01-10T12:30:00.000Z");
    expect(nicosiaInstant("2026-07-10", "geçersiz")).toBeNull();
  });

  it("doluluk yükleme penceresi Nicosia saatiyle 09:00-10:00'dur", () => {
    // 06:30Z = 09:30 in summer
    expect(checkUploadScheduleWindow(new Date("2026-07-10T06:30:00.000Z"))).toMatchObject({
      isWithinWindow: true,
      currentTimeStr: "09:30",
    });
    // the same instant in winter is 08:30
    expect(checkUploadScheduleWindow(new Date("2026-01-10T06:30:00.000Z"))).toMatchObject({
      isWithinWindow: false,
      currentTimeStr: "08:30",
    });
    expect(checkUploadScheduleWindow(new Date("2026-07-10T07:00:00.000Z")).isWithinWindow).toBe(false); // 10:00
  });
});
