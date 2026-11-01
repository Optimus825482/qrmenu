import { randomUUID } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, staffCtx, type OrderSetup } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { receipt } = await import("@/modules/order/server/receipt");
const { TZ } = await import("@/lib/time");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.orderCounter.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
});

afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function receiptOrder(s: OrderSetup, over: Record<string, unknown> = {}) {
  return testDb.order.create({
    data: {
      hotelId: s.hotelId,
      outletId: s.outlet.id,
      kind: "MASA",
      tableId: s.table.id,
      businessDate: new Date("2026-10-31T00:00:00.000Z"),
      orderNo: (await testDb.order.count()) + 1,
      status: "ONAYLANDI",
      guestLanguage: "tr",
      pricesShown: true,
      currency: "EUR",
      subtotal: "24.00",
      approvedAt: new Date("2026-10-31T09:30:00.000Z"),
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      items: {
        create: [{ menuNodeId: s.mojito.id, nameSnapshot: "Mojito", qty: 2, unitPrice: "12.00", note: "buzsuz" }],
      },
      ...over,
    },
  });
}

describe("receipt.build", () => {
  it("fiyat açık: unitPrice '12.00', total, subtotal '24.00', footer 'Ödeme belgesi değildir', currency", async () => {
    const s = await orderSetup();
    const order = await receiptOrder(s);
    const payload = await receipt.build(testDb, order.id);
    expect(payload.v).toBe(1);
    expect(payload.header).toMatchObject({ hotel: (await testDb.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } })).name, outlet: "Havuz Bar" });
    expect(payload.orderNo).toBe(order.orderNo);
    expect(payload.table).toBe("M1");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ name: "Mojito", qty: 2, note: "buzsuz", unitPrice: "12.00", total: "24.00" });
    expect(payload.subtotal).toBe("24.00");
    expect(payload.currency).toBe("EUR");
    expect(payload.pricesShown).toBe(true);
    expect(payload.footer).toEqual(["Ödeme belgesi değildir"]);
  });

  it("fiyat kapalı: unitPrice/total/subtotal yok, footer boş", async () => {
    const s = await orderSetup();
    const order = await receiptOrder(s, {
      pricesShown: false,
      subtotal: null,
      items: { create: [{ menuNodeId: s.mojito.id, nameSnapshot: "Mojito", qty: 2 }] },
    });
    const payload = await receipt.build(testDb, order.id);
    expect(payload.pricesShown).toBe(false);
    expect(payload.items[0]).toEqual({ name: "Mojito", qty: 2 });
    expect("unitPrice" in payload.items[0]).toBe(false);
    expect("total" in payload.items[0]).toBe(false);
    expect("subtotal" in payload).toBe(false);
    expect("currency" in payload).toBe(false);
    expect(payload.footer).toEqual([]);
  });

  it("at 'HH:mm dd.MM.yyyy' (Europe/Nicosia), approvedAt yoksa şimdi", async () => {
    const s = await orderSetup();
    const approved = new Date("2026-10-31T09:30:00.000Z");
    const order = await receiptOrder(s, { approvedAt: approved });
    expect((await receipt.build(testDb, order.id)).at).toBe(formatInTimeZone(approved, TZ, "HH:mm dd.MM.yyyy"));
    const pending = await testDb.order.create({
      data: {
        hotelId: s.hotelId,
        outletId: s.outlet.id,
        kind: "MASA",
        tableId: s.table.id,
        businessDate: new Date("2026-10-31T00:00:00.000Z"),
        orderNo: 2,
        status: "GONDERILDI",
        guestLanguage: "tr",
        idempotencyKey: randomUUID(),
        clientIp: "10.0.0.1",
        items: { create: [{ menuNodeId: s.mojito.id, nameSnapshot: "Mojito", qty: 1 }] },
      },
    });
    expect((await receipt.build(testDb, pending.id)).at).toMatch(/^\d{2}:\d{2} \d{2}\.\d{2}\.\d{4}$/);
  });

  it("waiter: atanmış garson adı; atanmamışsa onaylayan adı", async () => {
    const s = await orderSetup();
    const { user: garson } = await staffCtx("garson1", "R-GAR", s.outlet.id);
    const { user: kasiyer } = await staffCtx("kasiyer1", "R-KAS", s.outlet.id);
    const assigned = await receiptOrder(s, { assignedWaiterId: garson.id, approvedById: kasiyer.id });
    expect((await receipt.build(testDb, assigned.id)).waiter).toBe(garson.fullName);
    const unassigned = await receiptOrder(s, { approvedById: kasiyer.id });
    expect((await receipt.build(testDb, unassigned.id)).waiter).toBe(kasiyer.fullName);
  });
});
