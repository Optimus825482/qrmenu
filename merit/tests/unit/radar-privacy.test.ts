import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { RADAR_WIRE } from "@/modules/radar/events";
import { findForbiddenKeys, shortName } from "@/modules/radar/privacy";
import { testDb } from "../helpers/db";

// The listener and the publisher must talk to the test database, not the dev one.
vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { startRealtimeListener, stopRealtimeListener, subscribe, matchesScope } = await import("@/lib/realtime");
const { publishRadar } = await import("@/modules/radar/publish");

beforeAll(async () => {
  await startRealtimeListener();
});
afterAll(async () => {
  await stopRealtimeListener();
  await testDb.$disconnect();
});

describe("findForbiddenKeys", () => {
  it("iç içe nesne ve dizilerde yol listesi verir", () => {
    expect(findForbiddenKeys({ a: { note: 1 }, b: [{ unitPrice: 2 }] })).toEqual(["a.note", "b[0].unitPrice"]);
  });
  it("temiz değerde boş döner", () => {
    expect(findForbiddenKeys({ orderId: "o1", items: [{ qty: 1 }] })).toEqual([]);
    expect(findForbiddenKeys(null)).toEqual([]);
    expect(findForbiddenKeys("note")).toEqual([]);
  });
});

describe("shortName", () => {
  it("son sözcüğü kısaltır", () => {
    expect(shortName("Ayşe Kaya")).toBe("Ayşe K.");
    expect(shortName("Mehmet Ali Yılmaz")).toBe("Mehmet Ali Y.");
    expect(shortName("ışık özkan")).toBe("ışık Ö.");
    expect(shortName("  İlker   şahin ")).toBe("İlker Ş.");
  });
  it("tek sözcük aynen, boş tire", () => {
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName("   ")).toBe("—");
    expect(shortName("")).toBe("—");
  });
});

describe("RADAR_WIRE", () => {
  it("fiyat, not ve IP taşıyan yükü reddeder", () => {
    const ok = { requestId: "m1", roomId: "r1", byUserId: "u1" };
    expect(RADAR_WIRE["mybar.seen"].safeParse(ok).success).toBe(true);
    for (const extra of [{ price: 3 }, { note: "x" }, { ip: "1.2.3.4" }]) {
      expect(RADAR_WIRE["mybar.seen"].safeParse({ ...ok, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    expect(RADAR_WIRE["stock.changed"].safeParse({ productId: "p", remainingQty: 1, criticalLevel: 2, delta: -1, type: "T", unitPrice: 3 }).success).toBe(false);
  });
});

describe("publishRadar", () => {
  it("301 odalı dnd.missed fırlatır", async () => {
    const roomIds = Array.from({ length: 301 }, (_, i) => `r${i}`);
    await expect(publishRadar("dnd.missed", { hotelId: "h1" }, { date: "2026-11-03", roomIds })).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });

  it("yasak anahtarlı yükü yayınlamaz", async () => {
    const bad = { kind: "RAPOR", note: "x" } as never;
    await expect(publishRadar("mail.failed", { hotelId: "h1" }, bad)).rejects.toMatchObject({ code: "INTERNAL" });
  });

  function nextEvent(type: string, ms = 1000): Promise<MeritEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error("olay zamanında gelmedi"));
      }, ms);
      const off = subscribe(
        (e) => e.type === type,
        (e) => {
          clearTimeout(timer);
          off();
          resolve(e);
        },
      );
    });
  }

  it("mail.failed roleKinds ['SISTEM'] ile yayınlanır; yalnız SISTEM kapsamı alır", async () => {
    const got = nextEvent("mail.failed");
    await publishRadar("mail.failed", { hotelId: "h1" }, { kind: "RAPOR" });
    const e = await got;
    expect(e.roleKinds).toEqual(["SISTEM"]);
    expect(e.payload).toEqual({ kind: "RAPOR" });
    const scope = (roleKind: "SISTEM" | "YONETIM") => ({ userId: "u", sessionId: "s", hotelIds: ["h1"], roleKind });
    expect(matchesScope(e, scope("SISTEM"))).toBe(true);
    expect(matchesScope(e, scope("YONETIM"))).toBe(false);
  });

  it("minibar sınıfı olaylar SISTEM/YONETIM/MINIBAR; presence.tick SISTEM/YONETIM; sipariş sınıfı kısıtsız", async () => {
    const a = nextEvent("mybar.seen");
    await publishRadar("mybar.seen", { hotelId: "h1", roomId: "r1" }, { requestId: "m1", roomId: "r1", byUserId: "u1" });
    const seen = await a;
    expect(seen.roleKinds).toEqual(["SISTEM", "YONETIM", "MINIBAR"]);
    expect(seen.roomId).toBe("r1");

    const b = nextEvent("presence.tick");
    await publishRadar("presence.tick", { hotelId: "h1" }, { sessions: [] });
    expect((await b).roleKinds).toEqual(["SISTEM", "YONETIM"]);

    const c = nextEvent("printer.status");
    await publishRadar("printer.status", { hotelId: "h1" }, { printerId: "p1", ok: false, reason: "SESSIZ" });
    expect((await c).roleKinds).toBeUndefined();
  });
});
