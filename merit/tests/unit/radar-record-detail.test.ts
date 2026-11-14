import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, businessDay } from "@/lib/time";
import { findForbiddenKeys } from "@/modules/radar/privacy";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { makeRadarWorld, resetRadarData, type RadarHotelWorld, type RadarWorld } from "../helpers/radarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { radarRecordDetail, orderSteps } = await import("@/modules/radar/server/recordDetail");

let w: RadarWorld;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetRadarData();
  w = await makeRadarWorld();
});
afterAll(async () => {
  await resetRadarData();
  await dropReferenceData();
  await testDb.$disconnect();
});

let seq = 0;
/** A table order of the hotel's first outlet with one item, approved by the system user. */
async function tableOrder(hw: RadarHotelWorld, over: Record<string, unknown> = {}) {
  const outlet = hw.outlets[0]!;
  const node = await testDb.menuNode.create({ data: { outletId: outlet.outlet.id, kind: "OGE", name: `Radar ürün ${++seq}` } });
  return testDb.order.create({
    data: {
      hotelId: hw.hotelId,
      outletId: outlet.outlet.id,
      kind: "MASA",
      tableId: outlet.tables[0]!.id,
      businessDate: businessDay(businessDate()),
      orderNo: 5000 + seq,
      status: "ONAYLANDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.9.9.9",
      note: "gizli not",
      subtotal: "42.00",
      approvedAt: new Date(),
      approvedById: w.sys.user.id,
      items: { create: [{ menuNodeId: node.id, nameSnapshot: "Türk Kahvesi", qty: 2, unitPrice: "21.00", note: "şekersiz" }] },
      ...over,
    },
  });
}

describe("radar kayıt ayrıntısı", () => {
  it("masa: açık siparişin içeriği ve aşamaları gelir; fiyat ve not gelmez", async () => {
    const order = await tableOrder(w.royal);
    const d = await radarRecordDetail(w.sys, w.royal.hotelId, { kind: "table", id: order.tableId! });
    const content = d.sections.find((s) => s.title.endsWith("içerik"));
    expect(content?.lines).toEqual([{ name: "Türk Kahvesi", qty: 2 }]);
    const steps = d.sections.find((s) => s.title.endsWith("aşamalar"))?.steps ?? [];
    expect(steps.map((s) => s.label)[0]).toBe("Alındı");
    expect(steps).toHaveLength(2);
    expect(findForbiddenKeys(d)).toEqual([]);
    expect(JSON.stringify(d)).not.toMatch(/gizli not|şekersiz|42\.00|21\.00|10\.9\.9\.9/);
  });

  it("personel adı yalnız ad görebilen role gider", async () => {
    const order = await tableOrder(w.royal);
    const ref = { kind: "table" as const, id: order.tableId! };
    const named = JSON.stringify(await radarRecordDetail(w.sys, w.royal.hotelId, ref));
    const unnamed = JSON.stringify(await radarRecordDetail(w.floorWatcher, w.royal.hotelId, ref));
    expect(named).toContain(w.sys.user.fullName);
    expect(unnamed).not.toContain(w.sys.user.fullName);
    expect(unnamed).not.toContain('"by"');
  });

  it("başka otelin kaydı bulunamaz, kapsam dışı otel reddedilir", async () => {
    const order = await tableOrder(w.premium);
    await expect(radarRecordDetail(w.sys, w.royal.hotelId, { kind: "table", id: order.tableId! })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(radarRecordDetail(w.otmRoyal, w.premium.hotelId, { kind: "table", id: order.tableId! })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(radarRecordDetail(w.katRoyal, w.royal.hotelId, { kind: "room", id: w.royal.rooms[0]!.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("katmanı olmayan rol o katmanın kaydını açamaz", async () => {
    await expect(
      radarRecordDetail(w.customNoKat, w.royal.hotelId, { kind: "room", id: w.royal.rooms[0]!.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("oda: kontrol yoksa boş bölüm döner", async () => {
    const d = await radarRecordDetail(w.sys, w.royal.hotelId, { kind: "room", id: w.royal.rooms[0]!.id });
    expect(d.sections.find((s) => s.title === "Bugünkü oda kontrolleri")).toMatchObject({ steps: [], empty: "Bugün kontrol kaydı yok." });
  });
});

describe("orderSteps", () => {
  it("yalnız gerçekleşen aşamalar, zaman sırasıyla", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 14, 10, m));
    const steps = orderSteps(
      {
        kind: "ODA_SERVISI",
        createdAt: at(0),
        approvedAt: at(2),
        prepStartedAt: null,
        readyAt: at(10),
        onWayAt: at(12),
        servedAt: null,
        deliveredAt: at(20),
        cancelledAt: null,
        rejectedAt: null,
        approvedBy: { fullName: "Ayşe Kaya" },
        servedBy: null,
        deliveredBy: { fullName: "Ali Can" },
      },
      false,
    );
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.at)).toEqual([...steps.map((s) => s.at)].sort());
    expect(steps.some((s) => "by" in s)).toBe(false);
  });
});
