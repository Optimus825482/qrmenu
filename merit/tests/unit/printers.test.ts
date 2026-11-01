import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { orderSetup, staffCtx, type OrderSetup } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { printers } = await import("@/modules/order/server/printers");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.printer.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await testDb.auditLog.deleteMany({});
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

type S = { s: OrderSetup; ctx: Awaited<ReturnType<typeof adminCtx>> };

/** System context for hotel-wide printer administration. Outlet scope is tested separately. */
async function adminCtx() {
  const user = await makeUser({ username: "printer-admin", roleCode: "R-SYS", hotelCode: "MR" });
  return ctxFor(user, { hotelCode: "MR" });
}

async function setup(): Promise<S> {
  const s = await orderSetup();
  return { s, ctx: await adminCtx() };
}

const CREATE = { name: "Kasa Yazıcı", ip: "192.168.1.50", paperWidth: 80 };

describe("printers.create", () => {
  it("varsayılan port 9100, codepage cp857 ile oluşturur; PRINTER_CREATE audit + printer tanımı olayı", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    expect(row).toMatchObject({
      name: "Kasa Yazıcı",
      ip: "192.168.1.50",
      port: 9100,
      codepage: "cp857",
      paperWidth: 80,
      isActive: true,
      online: false,
      queued: 0,
      failed: 0,
    });
    expect(await testDb.auditLog.count({ where: { action: "PRINTER_CREATE", entityId: row.id } })).toBe(1);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "definition.changed",
        payload: expect.objectContaining({ entity: "printer", id: row.id, op: "create" }),
      }),
      expect.anything(),
    );
  });

  it("ip '300.1.1.1' VALIDATION; port sınır dışı VALIDATION; kâğıt 58|80 dışı VALIDATION", async () => {
    const { s, ctx } = await setup();
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, ip: "300.1.1.1" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, port: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, port: 65_536 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, paperWidth: 76 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, codepage: "cp437" } as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await testDb.printer.count()).toBe(0);
  });

  it("aynı adda yazıcı CONFLICT", async () => {
    const { s, ctx } = await setup();
    await printers.create(ctx, s.hotelId, CREATE);
    await expect(printers.create(ctx, s.hotelId, CREATE)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu adda bir yazıcı zaten var",
    });
  });

  it("outletId başka otelden VALIDATION", async () => {
    const { s, ctx } = await setup();
    const other = await testDb.outlet.create({
      data: { hotelId: await hotelId("MRP"), name: "Premium Bar", type: "BAR" },
    });
    await expect(printers.create(ctx, s.hotelId, { ...CREATE, outletId: other.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("R-GAR FORBIDDEN (QS-FIS satırı yok)", async () => {
    const { s } = await setup();
    const garson = (await staffCtx("garson", "R-GAR")).ctx;
    await expect(printers.create(garson, s.hotelId, CREATE)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("printers.update / setActive / delete", () => {
  it("update ip/port/paperWidth değiştirir; PRINTER_UPDATE audit", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    const updated = await printers.update(ctx, row.id, { ...CREATE, ip: "192.168.1.51", port: 9101, paperWidth: 58 });
    expect(updated).toMatchObject({ ip: "192.168.1.51", port: 9101, paperWidth: 58 });
    expect(await testDb.auditLog.count({ where: { action: "PRINTER_UPDATE", entityId: row.id } })).toBe(1);
  });

  it("setActive pasife alır; PRINTER_SET_ACTIVE audit", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await printers.setActive(ctx, row.id, false);
    expect((await testDb.printer.findUniqueOrThrow({ where: { id: row.id } })).isActive).toBe(false);
    expect(await testDb.auditLog.count({ where: { action: "PRINTER_SET_ACTIVE", entityId: row.id } })).toBe(1);
  });

  it("işi olan yazıcı silinemez CONFLICT 'Bu yazıcının iş kayıtları var'; işsiz silinir", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await testDb.printJob.create({
      data: { hotelId: s.hotelId, printerId: row.id, kind: "TEST", payload: {} },
    });
    await expect(printers.delete(ctx, row.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Bu yazıcının iş kayıtları var; silmek yerine pasife alın",
    });
    expect(await testDb.printer.count({ where: { id: row.id } })).toBe(1);

    await testDb.printJob.deleteMany({});
    await printers.delete(ctx, row.id);
    expect(await testDb.printer.count({ where: { id: row.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "PRINTER_DELETE", entityId: row.id } })).toBe(1);
  });
});

describe("printers.setOutletDefault", () => {
  it("Outlet.printerId yazar; PRINTER_SET_OUTLET_DEFAULT audit; null temizler", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await printers.setOutletDefault(ctx, s.outlet.id, row.id);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: s.outlet.id } })).printerId).toBe(row.id);
    expect(await testDb.auditLog.count({ where: { action: "PRINTER_SET_OUTLET_DEFAULT", entityId: s.outlet.id } })).toBe(1);

    await printers.setOutletDefault(ctx, s.outlet.id, null);
    expect((await testDb.outlet.findUniqueOrThrow({ where: { id: s.outlet.id } })).printerId).toBeNull();
  });

  it("başka otelin yazıcısı VALIDATION (iki oteli kapsayan yöneticiyle)", async () => {
    const { s, ctx } = await setup();
    const otherOutlet = await testDb.outlet.create({
      data: { hotelId: await hotelId("MRP"), name: "Premium Bar", type: "BAR" },
    });
    const row = await printers.create(ctx, s.hotelId, CREATE);
    const otom = await makeUser({ username: "otom", roleCode: "R-OTM", hotelCode: "MR", extraHotelCodes: ["MRP"] });
    const otomCtx = await ctxFor(otom, { hotelCode: "MR", extraHotelCodes: ["MRP"] });
    await expect(printers.setOutletDefault(otomCtx, otherOutlet.id, row.id)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("pasif yazıcı outlet varsayılanı yapılamaz", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await printers.setActive(ctx, row.id, false);
    await expect(printers.setOutletDefault(ctx, s.outlet.id, row.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("outlet oturumu başka outletin varsayılanını ve outlet-yazıcısını göremez/değiştiremez", async () => {
    const { s, ctx } = await setup();
    const other = await testDb.outlet.create({
      data: { hotelId: s.hotelId, name: "Beach Bar", type: "BAR", hasOrdering: true },
    });
    const sharedPrinter = await printers.create(ctx, s.hotelId, CREATE);
    const otherPrinter = await printers.create(ctx, s.hotelId, {
      ...CREATE,
      name: "Beach Yazıcı",
      ip: "192.168.1.51",
      outletId: other.id,
    });
    const ownPrinter = await printers.create(ctx, s.hotelId, {
      ...CREATE,
      name: "Havuz Yazıcı",
      ip: "192.168.1.52",
      outletId: s.outlet.id,
    });
    await printers.setOutletDefault(ctx, other.id, otherPrinter.id);

    const scoped = (await staffCtx("kasa.havuz", "R-KAS", s.outlet.id)).ctx;
    const rows = await printers.list(scoped, s.hotelId);
    expect(rows.map((printer) => printer.id)).toContain(sharedPrinter.id);
    expect(rows.map((printer) => printer.id)).toContain(ownPrinter.id);
    expect(rows.map((printer) => printer.id)).not.toContain(otherPrinter.id);
    await expect(printers.create(scoped, s.hotelId, CREATE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await printers.setOutletDefault(scoped, s.outlet.id, sharedPrinter.id);
    await printers.update(scoped, ownPrinter.id, { ...CREATE, name: "Havuz Yazıcı Güncel", outletId: s.outlet.id });
    expect(await printers.listOrderingOutlets(scoped, s.hotelId)).toMatchObject([
      { id: s.outlet.id, name: "Havuz Bar" },
    ]);
    await expect(printers.setOutletDefault(scoped, other.id, otherPrinter.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(printers.update(scoped, otherPrinter.id, { ...CREATE, outletId: other.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("printers.list", () => {
  it("queued = KUYRUKTA+BASILIYOR, failed = HATA sayısı; outletName yazıcının outleti", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    for (const status of ["KUYRUKTA", "BASILIYOR", "HATA", "BASILDI"] as const) {
      await testDb.printJob.create({
        data: {
          hotelId: s.hotelId,
          printerId: row.id,
          kind: "FIS",
          status,
          payload: {},
          ...(status === "HATA" ? { error: "yazıcı kapalı" } : {}),
        },
      });
    }
    const rows = await printers.list(ctx, s.hotelId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: row.id, queued: 2, failed: 1, online: false });
  });

  it("heartbeat sonrası online true (lastStatus 'OK'); 91 sn sonra online false", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await printers.heartbeat("MR", [{ id: row.id, ok: true }]);
    let rows = await printers.list(ctx, s.hotelId);
    expect(rows[0]).toMatchObject({ online: true, lastStatus: "OK" });
    expect(rows[0].lastSeenAt).not.toBeNull();

    await testDb.printer.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(Date.now() - 91_000) },
    });
    rows = await printers.list(ctx, s.hotelId);
    expect(rows[0].online).toBe(false);
    expect(rows[0].lastStatus).toBe("OK");
  });

  it("hiç heartbeat almayan yazıcı gri: lastSeenAt null, online false; MUTFAK listeyemez FORBIDDEN", async () => {
    const { s, ctx } = await setup();
    await printers.create(ctx, s.hotelId, CREATE);
    const rows = await printers.list(ctx, s.hotelId);
    expect(rows[0]).toMatchObject({ lastSeenAt: null, lastStatus: null, online: false });

    const sef = (await staffCtx("sef", "R-SGF")).ctx; // R-SGF: QS-FIS V,O,D,A (ISLET)
    expect((await printers.list(sef, s.hotelId)).length).toBe(1);
    const kds = (await staffCtx("kds", "R-KDS")).ctx; // MUTFAK: QS-FIS satırı yok
    await expect(printers.list(kds, s.hotelId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("printers.listOrderingOutlets", () => {
  it("yalnız hasOrdering outletleri { id, name, printerId } ile döner", async () => {
    const { s, ctx } = await setup();
    const row = await printers.create(ctx, s.hotelId, CREATE);
    await testDb.outlet.create({ data: { hotelId: s.hotelId, name: "Restorant", type: "SALON" } }); // hasOrdering false
    await printers.setOutletDefault(ctx, s.outlet.id, row.id);
    const outlets = await printers.listOrderingOutlets(ctx, s.hotelId);
    // Seed'in Oda Servisi outleti de sipariş alır; hasOrdering'siz Restorant listede yok.
    expect(outlets.some((o) => o.name === "Restorant")).toBe(false);
    expect(outlets.find((o) => o.id === s.outlet.id)).toMatchObject({
      id: s.outlet.id,
      name: "Havuz Bar",
      printerId: row.id,
    });
  });
});
