import { unzipSync } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQrToken, verifyQrToken } from "@/lib/qr";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));
const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));

const svc = await import("@/modules/minibar/server/roomQr");
const fileRoute = await import("@/app/api/qr/room/[roomId]/route");
const zipRoute = await import("@/app/api/qr/hotel/[hotelId]/room-zip/route");
const legacyRoute = await import("@/app/qr/[token]/route");
const { getApp } = await import("@/shell/registry");
const { registerMinibarApps } = await import("@/modules/minibar/apps");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  svc.resetRoomQrLimiters();
  publishMock.mockReset();
  requireUser.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof DomainError ? e.code : String(e);
  }
};
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};

const Q = { page: 1, pageSize: 100 } as const;
const LEGACY_TOKEN = "123456";

/** ROYAL: kat "Zemin Kat İç" with 101 (no QR), 102 (inactive, no QR), 103 (legacy token). */
async function world() {
  const hid = await hotelId("ROYAL");
  const floor = await testDb.floor.create({ data: { hotelId: hid, number: 0, name: "Zemin Kat İç" } });
  const mk = (number: string, extra: { isActive?: boolean; qrToken?: string } = {}) =>
    testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, ...extra } });
  const r101 = await mk("101");
  const r102 = await mk("102", { isActive: false });
  const r103 = await mk("103", { qrToken: LEGACY_TOKEN });
  return { hid, floor, r101, r102, r103 };
}
const tokenOf = async (id: string) => (await testDb.room.findUniqueOrThrow({ where: { id } })).qrToken;
async function otherHotelRoom() {
  const dHid = await hotelId("DIAMOND");
  const dFloor = await testDb.floor.create({ data: { hotelId: dHid, number: 1, name: "Kat 1" } });
  const dRoom = await testDb.room.create({ data: { hotelId: dHid, floorId: dFloor.id, number: "201" } });
  return { dHid, dRoom };
}

describe("generateRoomQr", () => {
  it("imzali 30 karakterlik token uretir, qrGeneratedAt yazar, denetimde tam token yok", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    const row = await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    const stored = await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } });
    expect(stored.qrToken).toHaveLength(30);
    expect(verifyQrToken(stored.qrToken!, "ROOM", w.r101.id)).toBe(true);
    expect(stored.qrGeneratedAt).not.toBeNull();
    expect(row).toMatchObject({ hasQr: true, format: "IMZALI", tokenTail: stored.qrToken!.slice(-4) });
    const logs = await testDb.auditLog.findMany({ where: { action: "ROOM_QR_GENERATE" } });
    expect(logs).toHaveLength(1);
    const json = JSON.stringify(logs[0]);
    expect(json).not.toContain(stored.qrToken!);
    expect(json).toContain(stored.qrToken!.slice(-4));
    expect(JSON.stringify(row)).not.toContain(stored.qrToken!);
  });

  it("token varken onaysiz CONFLICT; regenerate farkli token uretir, eskisi cozulmez", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    const first = (await tokenOf(w.r101.id))!;
    expect(await messageOf(svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {}))).toBe(
      "Bu odanın QR kodu zaten var; yenilemek için onaylayın",
    );
    expect(await codeOf(svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {}))).toBe("CONFLICT");
    expect(await tokenOf(w.r101.id)).toBe(first);
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, { regenerate: true });
    const second = (await tokenOf(w.r101.id))!;
    expect(second).not.toBe(first);
    expect(await testDb.room.findUnique({ where: { qrToken: first } })).toBeNull();
    const logs = await testDb.auditLog.findMany({ where: { action: "ROOM_QR_REGENERATE" } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain(first);
    expect(JSON.stringify(logs[0])).not.toContain(second);
  });

  it("pasif oda CONFLICT; baska otelin odasi NOT_FOUND; baska otel FORBIDDEN", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    expect(await messageOf(svc.generateRoomQr(otm.ctx, w.hid, w.r102.id, {}))).toBe("Pasif odaya QR üretilemez");
    expect(await tokenOf(w.r102.id)).toBeNull();

    const { dHid, dRoom } = await otherHotelRoom();
    expect(await codeOf(svc.generateRoomQr(otm.ctx, w.hid, dRoom.id, {}))).toBe("NOT_FOUND");
    expect(await codeOf(svc.generateRoomQr(otm.ctx, dHid, dRoom.id, {}))).toBe("FORBIDDEN");
    expect(await tokenOf(dRoom.id)).toBeNull();
  });

  it("R-HKS (yalniz izleme) ve R-KAT uretemez; R-HKS listeleyebilir, R-KAT listeleyemez", async () => {
    const w = await world();
    const dep = await staff("R-HKS");
    const kat = await staff("R-KAT");
    expect(await codeOf(svc.generateRoomQr(dep.ctx, w.hid, w.r101.id, {}))).toBe("FORBIDDEN");
    expect(await codeOf(svc.generateRoomQr(kat.ctx, w.hid, w.r101.id, {}))).toBe("FORBIDDEN");
    expect(await codeOf(svc.generateRoomQrBulk(dep.ctx, w.hid, { mode: "MISSING" }))).toBe("FORBIDDEN");
    expect(await codeOf(svc.setRoomGuestMessage(dep.ctx, w.hid, { roomIds: [w.r101.id], message: "x" }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(svc.listRoomQr(dep.ctx, w.hid, Q))).toBe("OK");
    expect(await codeOf(svc.listRoomQr(kat.ctx, w.hid, Q))).toBe("FORBIDDEN");
    expect(await tokenOf(w.r101.id)).toBeNull();
  });

  it("tekil uretim dakikada 30 ile sinirli, pencere sonra acilir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 30; i++) {
      await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, { regenerate: true });
    }
    expect(await messageOf(svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, { regenerate: true }))).toBe(
      "Çok fazla QR oluşturma denemesi. Lütfen 1 dakika bekleyin",
    );
    vi.setSystemTime(Date.now() + 61_000);
    expect(await codeOf(svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, { regenerate: true }))).toBe("OK");
  });
});

describe("generateRoomQrBulk", () => {
  it("MISSING yalniz QR'siz aktif odalari (101) isler", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    expect(await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "MISSING" })).toEqual({ count: 1 });
    expect(await tokenOf(w.r101.id)).toHaveLength(30);
    expect(await tokenOf(w.r102.id)).toBeNull();
    expect(await tokenOf(w.r103.id)).toBe(LEGACY_TOKEN);
    expect(await testDb.auditLog.count({ where: { action: "ROOM_QR_BULK_GENERATE" } })).toBe(1);
  });

  it("LEGACY ve ALL onaysiz VALIDATION; onayli LEGACY 103'u imzaliya geciri", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    for (const mode of ["LEGACY", "ALL"] as const) {
      try {
        await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode });
        expect.unreachable();
      } catch (e) {
        expect((e as DomainError).code).toBe("VALIDATION");
        expect((e as DomainError).fieldErrors?.confirmInvalidate).toEqual([
          "Eski QR kodları geçersiz olacak; onaylayın",
        ]);
      }
    }
    expect(await tokenOf(w.r103.id)).toBe(LEGACY_TOKEN);
    expect(await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "LEGACY", confirmInvalidate: true })).toEqual({
      count: 1,
    });
    expect(verifyQrToken((await tokenOf(w.r103.id))!, "ROOM", w.r103.id)).toBe(true);
    expect(await tokenOf(w.r101.id)).toBeNull();
  });

  it("ALL onayli tum aktif odalari yeniler, tokenlar degisir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "MISSING" });
    const before = (await tokenOf(w.r101.id))!;
    const res = await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "ALL", confirmInvalidate: true });
    expect(res).toEqual({ count: 2 });
    expect(await tokenOf(w.r101.id)).not.toBe(before);
    expect(await tokenOf(w.r102.id)).toBeNull();
    const logs = await testDb.auditLog.findMany({ where: { action: "ROOM_QR_BULK_GENERATE" } });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain(before);
  });

  it("uygun oda yoksa NOT_FOUND; kat suzgeci uygulanir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "MISSING" });
    expect(await messageOf(svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "MISSING" }))).toBe(
      "İşlem yapılacak oda bulunamadı",
    );
    const other = await testDb.floor.create({ data: { hotelId: w.hid, number: 5, name: "Kat 5" } });
    expect(
      await codeOf(
        svc.generateRoomQrBulk(otm.ctx, w.hid, { mode: "ALL", floorId: other.id, confirmInvalidate: true }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("4. toplu cagri 1 dk icinde RATE_LIMITED", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    vi.useFakeTimers({ toFake: ["Date"] });
    const all = { mode: "ALL", confirmInvalidate: true } as const;
    for (let i = 0; i < 3; i++) await svc.generateRoomQrBulk(otm.ctx, w.hid, all);
    expect(await codeOf(svc.generateRoomQrBulk(otm.ctx, w.hid, all))).toBe("RATE_LIMITED");
    vi.setSystemTime(Date.now() + 61_000);
    expect(await codeOf(svc.generateRoomQrBulk(otm.ctx, w.hid, all))).toBe("OK");
  });
});

describe("listRoomQr", () => {
  it("eski token ESKI + tokenTail, listede tam token ve url yok; suzgecler calisir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    const all = await svc.listRoomQr(otm.ctx, w.hid, Q);
    expect(all.total).toBe(3);
    const row103 = all.items.find((r) => r.id === w.r103.id)!;
    expect(row103).toMatchObject({ format: "ESKI", hasQr: true, tokenTail: "3456", floorName: "Zemin Kat İç" });
    const json = JSON.stringify(all);
    expect(json).not.toContain(`"${LEGACY_TOKEN}"`);
    expect(json).not.toContain((await tokenOf(w.r101.id))!);
    expect(json).not.toContain('"url"');
    const legacy = await svc.listRoomQr(otm.ctx, w.hid, { ...Q, qr: "LEGACY" });
    expect(legacy.items.map((r) => r.number)).toEqual(["103"]);
    const missing = await svc.listRoomQr(otm.ctx, w.hid, { ...Q, qr: "MISSING" });
    expect(missing.items.map((r) => r.number)).toEqual(["102"]);
    const signed = await svc.listRoomQr(otm.ctx, w.hid, { ...Q, qr: "SIGNED" });
    expect(signed.items.map((r) => r.number)).toEqual(["101"]);
    const empty = await svc.listRoomQr(otm.ctx, w.hid, { ...Q, qr: "MISSING", floorId: "yok" });
    expect(empty.total).toBe(0);
    const search = await svc.listRoomQr(otm.ctx, w.hid, { ...Q, q: "103" });
    expect(search.items.map((r) => r.number)).toEqual(["103"]);
  });
});

describe("setRoomGuestMessage", () => {
  it("HTML soyulur, bos mesaj null olur, denetim yazilir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    expect(
      await svc.setRoomGuestMessage(otm.ctx, w.hid, {
        roomIds: [w.r101.id, w.r103.id],
        message: "<b>Merhaba</b>\u0000 hoş geldiniz  ",
      }),
    ).toEqual({ count: 2 });
    expect((await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } })).guestMessage).toBe(
      "Merhaba hoş geldiniz",
    );
    await svc.setRoomGuestMessage(otm.ctx, w.hid, { roomIds: [w.r101.id], message: "   " });
    expect((await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } })).guestMessage).toBeNull();
    expect(await testDb.auditLog.count({ where: { action: "ROOM_GUEST_MESSAGE_SET" } })).toBe(2);
  });

  it("501 karakter VALIDATION; baska otelin odasi NOT_FOUND ve hicbir oda degismez", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    expect(
      await messageOf(svc.setRoomGuestMessage(otm.ctx, w.hid, { roomIds: [w.r101.id], message: "a".repeat(501) })),
    ).toBe("Mesaj en fazla 500 karakter olabilir");
    const { dRoom } = await otherHotelRoom();
    expect(
      await codeOf(svc.setRoomGuestMessage(otm.ctx, w.hid, { roomIds: [w.r101.id, dRoom.id], message: "Merhaba" })),
    ).toBe("NOT_FOUND");
    expect((await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } })).guestMessage).toBeNull();
    expect(await codeOf(svc.setRoomGuestMessage(otm.ctx, w.hid, { roomIds: [], message: "x" }))).toBe("VALIDATION");
  });
});

describe("yan etkisiz indirme", () => {
  it("renderRoomQrFile iki kez cagrilinca token ve qrGeneratedAt degismez; dosya adi ve PNG imzasi", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    const before = await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } });
    const a = await svc.renderRoomQrFile(otm.ctx, w.r101.id, "svg");
    const b = await svc.renderRoomQrFile(otm.ctx, w.r101.id, "svg");
    const png = await svc.renderRoomQrFile(otm.ctx, w.r101.id, "png");
    expect(a.filename).toBe("ROYAL_Zemin_Kat_Ic_Oda101_QR.svg");
    expect(a.contentType).toContain("image/svg+xml");
    expect(Buffer.from(a.body).toString()).toBe(Buffer.from(b.body).toString());
    expect([...png.body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const after = await testDb.room.findUniqueOrThrow({ where: { id: w.r101.id } });
    expect(after.qrToken).toBe(before.qrToken);
    expect(after.qrGeneratedAt).toEqual(before.qrGeneratedAt);
  });

  it("QR'siz odada NOT_FOUND ve token uretilmez; legacy token aynen indirilir", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    expect(await messageOf(svc.renderRoomQrFile(otm.ctx, w.r101.id, "svg"))).toBe("Bu odanın QR kodu yok");
    expect(await tokenOf(w.r101.id)).toBeNull();
    expect(await codeOf(svc.renderRoomQrFile(otm.ctx, w.r103.id, "svg"))).toBe("OK");
    expect(await tokenOf(w.r103.id)).toBe(LEGACY_TOKEN);
  });

  it("baska otelin odasi NOT_FOUND; R-KAT FORBIDDEN", async () => {
    const w = await world();
    await testDb.room.update({ where: { id: w.r101.id }, data: { qrToken: generateQrToken("ROOM", w.r101.id) } });
    const dep = await staff("R-DEP", "DIAMOND");
    const kat = await staff("R-KAT");
    expect(await codeOf(svc.renderRoomQrFile(dep.ctx, w.r101.id, "svg"))).toBe("NOT_FOUND");
    expect(await codeOf(svc.renderRoomQrFile(kat.ctx, w.r101.id, "svg"))).toBe("FORBIDDEN");
  });

  it("roomQrZip yalniz QR'li aktif odalari + BOM'lu etiketler.csv; tokenlar degismez", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    await testDb.room.update({ where: { id: w.r102.id }, data: { qrToken: generateQrToken("ROOM", w.r102.id) } });
    const snap = async () =>
      JSON.stringify((await testDb.room.findMany({ orderBy: { number: "asc" } })).map((r) => [r.qrToken, r.qrGeneratedAt]));
    const snapshot = await snap();
    const zip = await svc.roomQrZip(otm.ctx, w.hid, {}, new Date("2026-11-03T10:00:00Z"));
    expect(zip.filename).toBe("QR_Kodlari_ROYAL_20261103.zip");
    const files = unzipSync(new Uint8Array(zip.body));
    expect(Object.keys(files).sort()).toEqual([
      "ROYAL_Zemin_Kat_Ic_Oda101_QR.svg",
      "ROYAL_Zemin_Kat_Ic_Oda103_QR.svg",
      "etiketler.csv",
    ]);
    const csv = Buffer.from(files["etiketler.csv"]).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split("\n");
    expect(lines[0]).toBe("Oda;Kat;URL");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^101;Zemin Kat İç;http\S+\/q\/\S{30}$/);
    expect(lines[2]).toMatch(/^103;Zemin Kat İç;http\S+\/q\/123456$/);
    expect(await snap()).toBe(snapshot);
  });

  it("QR'li oda yoksa roomQrZip NOT_FOUND", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await testDb.room.update({ where: { id: w.r103.id }, data: { qrToken: null } });
    expect(await messageOf(svc.roomQrZip(otm.ctx, w.hid, {}))).toBe("QR kodu olan oda bulunamadı");
    expect(await tokenOf(w.r101.id)).toBeNull();
  });
});

describe("roomQrPrintSheet", () => {
  it("QR'siz ve pasif odalar atlanir; otel adi ve kartlar doner", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    await testDb.room.update({ where: { id: w.r102.id }, data: { qrToken: generateQrToken("ROOM", w.r102.id) } });
    const sheet = await svc.roomQrPrintSheet(otm.ctx, w.hid, {});
    expect(sheet.cards.map((c) => c.roomNumber)).toEqual(["101", "103"]);
    expect(sheet.cards[0]).toMatchObject({ floorName: "Zemin Kat İç" });
    expect(sheet.cards[0].svg).toContain("<svg");
    expect(sheet.hotel.name).toBeTruthy();
    const only = await svc.roomQrPrintSheet(otm.ctx, w.hid, { roomIds: [w.r103.id] });
    expect(only.cards.map((c) => c.roomNumber)).toEqual(["103"]);
  });
});

describe("roomQrPrintHtml", () => {
  it("masa baskisiyla ayni kart sayfasi: QR'li odalar, sablon/tema ve kat suzgeci; secimde suzgec yok", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    await svc.generateRoomQr(otm.ctx, w.hid, w.r101.id, {});
    const html = await svc.roomQrPrintHtml(otm.ctx, w.hid, { template: "compact", theme: "dark" });
    expect(html).toContain("Oda QR Kartları");
    expect(html.match(/class="card" data-template="compact" data-theme="dark"/g)).toHaveLength(2);
    expect(html).toContain('<span class="label">101</span>');
    expect(html).toContain("updateParam('floorId'");
    expect(html).not.toContain("Masa QR");
    const only = await svc.roomQrPrintHtml(otm.ctx, w.hid, { roomIds: [w.r103.id] });
    expect(only.match(/class="card" data-template="stand" data-theme="royal"/g)).toHaveLength(1);
    expect(only).not.toContain("updateParam('floorId'");
    const kat = await staff("R-KAT");
    await expect(svc.roomQrPrintHtml(kat.ctx, w.hid, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("route'lar ve uygulama kaydi", () => {
  it("indirme route'u oturumsuz 401; QR'siz 404 ve token uretmez; gecerli dosya", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    const call = (id: string, qs = "") =>
      fileRoute.GET(new Request(`http://t/api/qr/room/x${qs}`), { params: Promise.resolve({ roomId: id }) });
    requireUser.mockRejectedValueOnce(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    expect((await call(w.r101.id)).status).toBe(401);
    requireUser.mockResolvedValue(otm.ctx);
    expect((await call(w.r101.id)).status).toBe(404);
    expect(await tokenOf(w.r101.id)).toBeNull();
    const ok = await call(w.r103.id, "?format=svg");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("ROYAL_Zemin_Kat_Ic_Oda103_QR.svg");
    expect((await call(w.r103.id, "?format=gif")).status).toBe(400);
  });

  it("ZIP route'u oturumsuz 401; QR'siz otelde 404 ve token uretmez", async () => {
    const w = await world();
    const otm = await staff("R-OTM");
    const call = () => zipRoute.GET(new Request("http://t/z"), { params: Promise.resolve({ hotelId: w.hid }) });
    requireUser.mockRejectedValueOnce(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    expect((await call()).status).toBe(401);
    requireUser.mockResolvedValue(otm.ctx);
    await testDb.room.update({ where: { id: w.r103.id }, data: { qrToken: null } });
    expect((await call()).status).toBe(404);
    expect(await testDb.room.count({ where: { qrToken: { not: null } } })).toBe(0);
  });

  it("/qr/123456 308 ile /q/123456'ya gider; gecersiz token 404", async () => {
    const go = (token: string) =>
      legacyRoute.GET(new Request("http://t/qr/x"), { params: Promise.resolve({ token }) });
    const res = await go("123456");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/q/123456");
    expect((await go("../x")).status).toBe(404);
    expect((await go("a".repeat(65))).status).toBe(404);
  });

  it("minibar.odaqr uygulamasi MB-TAN ekranina bagli", () => {
    registerMinibarApps();
    expect(getApp("minibar.odaqr")?.screenCode).toBe("MB-TAN");
  });
});
