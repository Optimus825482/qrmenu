import { describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { SLA_WARN_RATIO, slaDue, slaStart, slaStateOf } = await import("@/modules/order/server/roomService/sla");

const T0 = new Date("2026-11-03T10:00:00.000Z");
const at = (min: number, sec = 0) => new Date(T0.getTime() + (min * 60 + sec) * 1000);
const SLA = 30;

type O = { status: OrderStatus; phoneConfirmedAt: Date | null; createdAt: Date; deliveredAt: Date | null };
const order = (over: Partial<O> = {}): O => ({
  status: "ONAYLANDI",
  phoneConfirmedAt: null,
  createdAt: T0,
  deliveredAt: null,
  ...over,
});

describe("slaStart / slaDue", () => {
  it("teyit yoksa createdAt, teyit varsa phoneConfirmedAt", () => {
    expect(slaStart({ phoneConfirmedAt: null, createdAt: T0 })).toEqual(T0);
    expect(slaStart({ phoneConfirmedAt: at(15), createdAt: T0 })).toEqual(at(15));
  });
  it("slaDue = başlangıç + dakika", () => {
    expect(slaDue({ phoneConfirmedAt: null, createdAt: T0 }, 30)).toEqual(at(30));
    expect(slaDue({ phoneConfirmedAt: at(15), createdAt: T0 }, 10)).toEqual(at(25));
  });
  it("uyarı oranı 0.8", () => expect(SLA_WARN_RATIO).toBe(0.8));
});

describe("slaStateOf", () => {
  const state = (o: O, nowAt: Date) => slaStateOf(o, nowAt, SLA);
  it("23:59 OK; 24:00 sınırı WARN (>=%80 kuralı, sweep ile aynı); 24:01 WARN", () => {
    expect(state(order(), at(23, 59))).toBe("OK");
    expect(state(order(), at(24, 0))).toBe("WARN");
    expect(state(order(), at(24, 1))).toBe("WARN");
  });
  it("5 dk OK; 29:59 WARN; 30 dk BREACH; 31 dk BREACH", () => {
    expect(state(order(), at(5))).toBe("OK");
    expect(state(order(), at(29, 59))).toBe("WARN");
    expect(state(order(), at(30))).toBe("BREACH");
    expect(state(order(), at(31))).toBe("BREACH");
  });
  it("GONDERILDI / HAZIR / YOLDA da sayılır", () => {
    for (const status of ["GONDERILDI", "HAZIR", "YOLDA"] as const) {
      expect(state(order({ status }), at(31))).toBe("BREACH");
    }
  });
  it("TEYIT_BEKLIYOR her zaman OK (sayaç işlemez)", () => {
    expect(state(order({ status: "TEYIT_BEKLIYOR" }), at(90))).toBe("OK");
  });
  it("teyitten sonra saat phoneConfirmedAt'ten ölçülür", () => {
    const o = order({ phoneConfirmedAt: at(25) });
    expect(state(o, at(40))).toBe("OK"); // 15 dk
    expect(state(o, at(56))).toBe("BREACH"); // 31 dk
  });
  it("teslim: 29 dk ON_TIME, 30 dk ve 31 dk LATE", () => {
    const done = (min: number) => order({ status: "TESLIM_EDILDI", deliveredAt: at(min) });
    expect(state(done(29), at(500))).toBe("DONE_ON_TIME");
    expect(state(done(30), at(500))).toBe("DONE_LATE");
    expect(state(done(31), at(500))).toBe("DONE_LATE");
  });
  it("teslim süresi de teyitten ölçülür", () => {
    const o = order({ status: "TESLIM_EDILDI", phoneConfirmedAt: at(20), deliveredAt: at(45) });
    expect(state(o, at(500))).toBe("DONE_ON_TIME"); // 25 dk
  });
  it("IPTAL ve REDDEDILDI CANCELLED", () => {
    expect(state(order({ status: "IPTAL" }), at(90))).toBe("CANCELLED");
    expect(state(order({ status: "REDDEDILDI" }), at(90))).toBe("CANCELLED");
  });
});
