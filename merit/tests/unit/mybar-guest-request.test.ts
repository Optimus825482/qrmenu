import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQrToken } from "@/lib/qr";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const publishMock = vi.mocked(publish);
const { setTranslationProviderForTests } = await import("@/modules/mybar/server/translate");
const { sanitizeNote } = await import("@/modules/mybar/server/sanitize");
const { roomCatalog, catalogProductIds } = await import("@/modules/mybar/server/catalog");
const { getRoomGuestState, openRoom } = await import("@/modules/mybar/server/roomGuest");
const guest = await import("@/modules/mybar/server/guestRequest");
const { ipLimiter, roomLimiter } = guest;
const { rateLimitDelay, unknownTokenLimiter, globalUnknownTokenLimiter } = await import(
  "@/modules/menu/server/guestToken"
);
const { POST, GET } = await import("@/app/api/q/[token]/mybar/route");

beforeAll(async () => {
  await resetReferenceData();
  rateLimitDelay.ms = 0;
});
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  ipLimiter.clear();
  roomLimiter.clear();
  unknownTokenLimiter.clear();
  globalUnknownTokenLimiter.clear();
  publishMock.mockClear();
  setTranslationProviderForTests(null);
});
afterEach(() => {
  vi.useRealTimers();
  setTranslationProviderForTests(null);
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
    return (e as { code?: string }).code ?? String(e);
  }
};
const errOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string; fieldErrors?: Record<string, string[]> };
  }
  throw new Error("beklenen hata oluşmadı");
};

async function setSetting(_admin: unknown, key: string, value: unknown, hid: string) {
  await testDb.setting.deleteMany({ where: { key, hotelId: hid } });
  await testDb.setting.create({ data: { key, hotelId: hid, value: value as never } });
}
const sysAdmin = async () => null;

type World = Awaited<ReturnType<typeof minibarWorld>>;
const submit = (
  w: World,
  items: { productId: string; qty: number }[] = [{ productId: w.cola.id, qty: 1 }],
  over: Record<string, unknown> = {},
) =>
  guest.createGuestRequest({
    token: w.room.qrToken!,
    idempotencyKey: randomUUID(),
    locale: "tr",
    items,
    ip: "10.1.1.1",
    userAgent: "vitest",
    ...over,
  } as never);

describe("sanitizeNote", () => {
  it("etiketleri soyar, iç metni korur, kontrol karakterlerini atar", () => {
    expect(sanitizeNote("<b>buzsuz</b>")).toBe("buzsuz");
    expect(sanitizeNote("<div><b>merhaba</b></div>")).toBe("merhaba");
    expect(sanitizeNote("a\u0000b\u0007c")).toBe("abc");
    expect(sanitizeNote("a\n\n\n\n\nb  ")).toBe("a\n\nb");
  });
});

describe("katalog", () => {
  it("aynı ürün iki setup'ta ise en yüksek adet; maxQty setup adedi", async () => {
    const w = await minibarWorld({ setupQty: 2 });
    const second = await testDb.setup.create({
      data: { name: `S2-${randomUUID().slice(0, 6)}`, items: { create: [{ productId: w.cola.id, qty: 3 }] } },
    });
    await testDb.roomTypeSetup.create({ data: { hotelId: w.hotelId, roomTypeId: w.roomType.id, setupId: second.id } });
    const cat = await roomCatalog(w.room.id, "tr");
    const cola = cat.groups.flatMap((g) => g.products).find((p) => p.id === w.cola.id)!;
    expect(cola.setupQty).toBe(3);
    expect(cola.maxQty).toBe(3);
    expect(cat.quantityMode).toBe("QTY");
  });

  it("TICK modunda ve maxQtyPerItem=1 iken maxQty 1; üst sınır 20", async () => {
    const w = await minibarWorld({ setupQty: 30 });
    const admin = await sysAdmin();
    let cat = await roomCatalog(w.room.id, "tr");
    expect(cat.groups[0].products[0].maxQty).toBe(20);
    await setSetting(admin, "mybar.maxQtyPerItem", 1, w.hotelId);
    cat = await roomCatalog(w.room.id, "tr");
    expect(cat.groups[0].products.every((p) => p.maxQty === 1)).toBe(true);
    await setSetting(admin, "mybar.maxQtyPerItem", "setup", w.hotelId);
    await setSetting(admin, "mybar.quantityMode", "TICK", w.hotelId);
    cat = await roomCatalog(w.room.id, "tr");
    expect(cat.quantityMode).toBe("TICK");
    expect(cat.groups[0].products.every((p) => p.maxQty === 1)).toBe(true);
  });

  it("pasif ürün, grup ve setup listede yok; oda tipsiz boş", async () => {
    const w = await minibarWorld();
    await testDb.product.update({ where: { id: w.water.id }, data: { isActive: false } });
    let ids = await catalogProductIds(w.room.id);
    expect([...ids.keys()]).toEqual([w.cola.id]);
    await testDb.productGroup.update({ where: { id: w.group.id }, data: { isActive: false } });
    expect((await roomCatalog(w.room.id, "tr")).groups).toEqual([]);
    await testDb.productGroup.update({ where: { id: w.group.id }, data: { isActive: true } });
    await testDb.setup.update({ where: { id: w.setup.id }, data: { isActive: false } });
    ids = await catalogProductIds(w.room.id);
    expect(ids.size).toBe(0);
    await testDb.setup.update({ where: { id: w.setup.id }, data: { isActive: true } });
    await testDb.room.update({ where: { id: w.room.id }, data: { roomTypeId: null } });
    expect((await roomCatalog(w.room.id, "tr")).groups).toEqual([]);
  });

  it("ar için önbellekteki çeviri nameLocal olur; tr'de nameLocal = name; fiyat alanı yok", async () => {
    const w = await minibarWorld();
    await testDb.textTranslation.create({
      data: {
        sourceHash: createHash("sha256").update(w.cola.name).digest("hex"),
        targetLang: "ar",
        sourceText: w.cola.name,
        translated: "كولا",
        provider: "test",
      },
    });
    setTranslationProviderForTests({
      name: "fake",
      translate: async (text) => ({ text, sourceLang: "tr", translated: true }),
    });
    const ar = await roomCatalog(w.room.id, "ar");
    const colaAr = ar.groups[0].products.find((p) => p.id === w.cola.id)!;
    expect(colaAr.nameLocal).toBe("كولا");
    expect(colaAr.name).toBe(w.cola.name);
    const tr = await roomCatalog(w.room.id, "tr");
    expect(tr.groups[0].products.every((p) => p.nameLocal === p.name)).toBe(true);
    expect(JSON.stringify(tr)).not.toMatch(/price/i);
  });
});

/** The S0 seed gives every hotel an Oda Servisi outlet; `getRoomGuestState` omits `reason` while it is open. */
const closeRoomService = (hotelId: string) =>
  testDb.outlet.updateMany({ where: { hotelId, type: "ODA_SERVISI" }, data: { isActive: false } });

describe("oda durumu", () => {
  it("pasif oda ODA_PASIF, modül kapalı MYBAR_KAPALI, otel pasif OTEL_PASIF", async () => {
    const w = await minibarWorld();
    expect((await getRoomGuestState(w.room.id)).mybarOpen).toBe(true);
    await closeRoomService(w.hotelId); // `reason` is only reported when room service is closed as well (P6)
    await testDb.room.update({ where: { id: w.room.id }, data: { isActive: false } });
    expect(await getRoomGuestState(w.room.id)).toMatchObject({ mybarOpen: false, reason: "ODA_PASIF" });
    await testDb.room.update({ where: { id: w.room.id }, data: { isActive: true } });
    await testDb.hotelModule.updateMany({ where: { hotelId: w.hotelId, moduleKey: "MINIBAR" }, data: { enabled: false } });
    expect(await getRoomGuestState(w.room.id)).toMatchObject({ mybarOpen: false, reason: "MYBAR_KAPALI" });
    await testDb.hotelModule.updateMany({ where: { hotelId: w.hotelId, moduleKey: "MINIBAR" }, data: { enabled: true } });
    await testDb.hotel.update({ where: { id: w.hotelId }, data: { isActive: false } });
    expect(await getRoomGuestState(w.room.id)).toMatchObject({ mybarOpen: false, reason: "OTEL_PASIF" });
  });

  it("doluluk yüklendiyse ve oda boşsa ODA_BOS; doluysa açık; veri yoksa açık", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const [a, b] = w.rooms;
    await closeRoomService(w.hotelId);
    const rec = (roomId: string) =>
      testDb.guestRecord.create({
        data: {
          hotelId: w.hotelId,
          roomId,
          batchCode: "B",
          guestCount: 2,
          arrivalDate: new Date(Date.UTC(2026, 10, 1)),
          departureDate: new Date(Date.UTC(2026, 10, 9)),
          kind: "IN_HOUSE",
        },
      });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
    expect((await getRoomGuestState(a.id)).mybarOpen).toBe(true);
    await rec(a.id);
    expect((await getRoomGuestState(a.id)).mybarOpen).toBe(true);
    expect(await getRoomGuestState(b.id)).toMatchObject({ mybarOpen: false, reason: "ODA_BOS" });
  });

  it("openRoom scan.room yayınlar", async () => {
    const w = await minibarWorld();
    const state = await openRoom({ kind: "ROOM", roomId: w.room.id, hotelId: w.hotelId });
    expect(state.roomNumber).toBe(w.room.number);
    expect(publishMock.mock.calls.some(([e]) => e.type === "scan.room")).toBe(true);
  });
});

describe("talep oluşturma", () => {
  it("başarı: BEKLEMEDE, kalemler, denetim (userId null), bildirimler, mybar.created", async () => {
    const w = await minibarWorld();
    await staff("R-KAT");
    await staff("R-DEP");
    await staff("R-OTM");
    const res = await submit(
      w,
      [
        { productId: w.cola.id, qty: 2 },
        { productId: w.water.id, qty: 1 },
      ],
      { note: "buzlu olsun" },
    );
    expect(res.duplicate).toBe(false);
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: res.requestId }, include: { items: true } });
    expect(row.status).toBe("BEKLEMEDE");
    expect(row.hotelId).toBe(w.hotelId);
    expect(row.items).toHaveLength(2);
    expect(row.clientIp).toBe("10.1.1.1");
    expect(row.note).toBe("buzlu olsun");
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MYBAR_CREATE", entityId: res.requestId } });
    expect(log.userId).toBeNull();
    expect(log.ip).toBe("10.1.1.1");
    expect(JSON.stringify(log.after)).not.toContain("buzlu");
    expect(await testDb.notification.count({ where: { type: "mybar.created", refId: res.requestId } })).toBe(3);
    const note = await testDb.notification.findFirstOrThrow({ where: { refId: res.requestId } });
    expect(note.title).toBe(`Oda ${w.room.number} - Yeni MyBar talebi`);
    expect(note.body).toContain("×2");
    expect(publishMock.mock.calls.some(([e]) => e.type === "mybar.created")).toBe(true);
  });

  it("idempotency: aynı anahtar → aynı talep, duplicate, ek bildirim yok; farklı oda → CONFLICT", async () => {
    const w = await minibarWorld({ rooms: 2 });
    await staff("R-KAT");
    const key = randomUUID();
    const a = await submit(w, undefined, { idempotencyKey: key });
    const b = await submit(w, undefined, { idempotencyKey: key });
    expect(b.requestId).toBe(a.requestId);
    expect(b.duplicate).toBe(true);
    expect(await testDb.notification.count({ where: { type: "mybar.created" } })).toBe(1);
    expect(await codeOf(submit(w, undefined, { idempotencyKey: key, token: w.rooms[1].qrToken }))).toBe("CONFLICT");
  });

  it("eşzamanlı iki farklı anahtar → bir talep, diğeri DAILY_LIMIT; aynı anahtar → tek satır", async () => {
    const w = await minibarWorld();
    const r = await Promise.all([submit(w), submit(w)].map((p) => p.then(() => "OK", (e) => e.code)));
    expect(r.sort()).toEqual(["DAILY_LIMIT", "OK"]);
    expect(await testDb.mybarRequest.count()).toBe(1);
    await testDb.mybarRequest.deleteMany();
    const key = randomUUID();
    const same = await Promise.all([
      submit(w, undefined, { idempotencyKey: key }),
      submit(w, undefined, { idempotencyKey: key }),
    ]);
    expect(same[0].requestId).toBe(same[1].requestId);
    expect(await testDb.mybarRequest.count()).toBe(1);
  });

  it("iş günü Europe/Nicosia: gece yarısı sınırı, IPTAL serbest bırakır, TAMAMLANDI bırakmaz, ayar kapalıysa sınırsız", async () => {
    const w = await minibarWorld();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T21:59:30Z"));
    await submit(w);
    vi.setSystemTime(new Date("2026-11-02T22:00:30Z"));
    await submit(w);
    expect(await codeOf(submit(w))).toBe("DAILY_LIMIT");
    await testDb.mybarRequest.updateMany({ data: { status: "IPTAL", cancelledAt: new Date() } });
    await submit(w);
    await testDb.mybarRequest.updateMany({
      where: { status: "IPTAL" },
      data: { status: "TAMAMLANDI", cancelledAt: null, completedAt: new Date() },
    });
    expect(await codeOf(submit(w))).toBe("DAILY_LIMIT");
    const admin = await sysAdmin();
    await setSetting(admin, "mybar.dailyLimit", false, w.hotelId);
    await submit(w);
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    await submit(other);
    expect(await codeOf(submit(other))).toBe("DAILY_LIMIT");
  });

  it("not çevirisi: noteTr dolar; sağlayıcı reddederse talep yine oluşur", async () => {
    const w = await minibarWorld();
    setTranslationProviderForTests({
      name: "fake",
      translate: async () => ({ text: "buz istemiyorum", sourceLang: "en", translated: true }),
    });
    const a = await submit(w, undefined, { note: "no ice please", locale: "en" });
    const rowA = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: a.requestId } });
    expect(rowA.noteTr).toBe("buz istemiyorum");
    expect(rowA.noteSrcLang).toBe("en");
    expect(rowA.language).toBe("en");
    await testDb.mybarRequest.deleteMany();
    setTranslationProviderForTests({
      name: "fake",
      translate: async () => {
        throw new Error("down");
      },
    });
    const b = await submit(w, undefined, { note: "no ice please" });
    const rowB = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: b.requestId } });
    expect(rowB.note).toBe("no ice please");
    expect(rowB.noteTr).toBeNull();
  });

  it("sağlayıcı sonsuz → 5 sn altında; çeviri sırasında oda kilidi tutulmaz", async () => {
    const w = await minibarWorld({ rooms: 2 });
    setTranslationProviderForTests({ name: "fake", translate: () => new Promise(() => {}) });
    const t0 = Date.now();
    const slow = submit(w, undefined, { note: "hello there" });
    const other = await submit({ ...w, room: w.rooms[1] } as World);
    expect(other.duplicate).toBe(false);
    const done = await slow;
    expect(done.duplicate).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("token ve oda kontrolleri", async () => {
    const w = await minibarWorld();
    const table = { ...w, room: { ...w.room, qrToken: generateQrToken("TABLE", "x") } } as World;
    expect(await codeOf(submit(table))).toBe("NOT_FOUND");
    expect(await codeOf(submit({ ...w, room: { ...w.room, qrToken: "yok-boyle-bir-token" } } as World))).toBe(
      "NOT_FOUND",
    );
    expect(await testDb.qrScanLog.count({ where: { ok: false } })).toBeGreaterThan(0);
    await testDb.room.update({ where: { id: w.room.id }, data: { isActive: false } });
    expect(await codeOf(submit(w))).toBe("CONFLICT");
    expect(await testDb.mybarRequest.count()).toBe(0);
  });

  it("ürün setup'tan çıkarılmışsa VALIDATION ve ad; qty > maxQty VALIDATION; tekrar eden ürün VALIDATION", async () => {
    const w = await minibarWorld({ setupQty: 2 });
    await testDb.setupItem.deleteMany({ where: { setupId: w.setup.id, productId: w.water.id } });
    const e = await errOf(submit(w, [{ productId: w.water.id, qty: 1 }]));
    expect(e.code).toBe("VALIDATION");
    expect(e.fieldErrors?.items).toEqual([w.water.name]);
    expect(await testDb.mybarRequest.count()).toBe(0);
    expect(await codeOf(submit(w, [{ productId: w.cola.id, qty: 3 }]))).toBe("VALIDATION");
    expect(
      await codeOf(
        submit(w, [
          { productId: w.cola.id, qty: 1 },
          { productId: w.cola.id, qty: 1 },
        ]),
      ),
    ).toBe("VALIDATION");
    expect(await testDb.mybarRequest.count()).toBe(0);
  });

  it("girdi: etiket soyulur, 501 karakter reddedilir, boş istek reddedilir, yalnız not geçerli, TICK qty 1", async () => {
    const w = await minibarWorld();
    const a = await submit(w, [], { note: "<b>buzsuz</b>" });
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: a.requestId }, include: { items: true } });
    expect(row.note).toBe("buzsuz");
    expect(row.items).toHaveLength(0);
    await testDb.mybarRequest.deleteMany();
    const long = await errOf(submit(w, undefined, { note: "x".repeat(501) }));
    expect(long.fieldErrors?.note).toEqual(["Not en fazla 500 karakter olabilir"]);
    const empty = await errOf(submit(w, []));
    expect(empty.message).toBe("En az bir ürün seçmeli veya not eklemelisiniz.");
    const admin = await sysAdmin();
    await setSetting(admin, "mybar.quantityMode", "TICK", w.hotelId);
    const t = await submit(w, [{ productId: w.cola.id, qty: 2 }]);
    const items = await testDb.mybarRequestItem.findMany({ where: { requestId: t.requestId } });
    expect(items[0].requestedQty).toBe(1);
  });

  it("IP başına dakikada 30 deneme, 31. RATE_LIMITED", async () => {
    const w = await minibarWorld();
    const admin = await sysAdmin();
    await setSetting(admin, "mybar.dailyLimit", false, w.hotelId);
    for (let i = 0; i < 30; i++) await submit(w, undefined, { ip: "9.9.9.9" });
    expect(await codeOf(submit(w, undefined, { ip: "9.9.9.9" }))).toBe("RATE_LIMITED");
    expect(await codeOf(submit(w, undefined, { ip: "9.9.9.8" }))).toBe("OK");
  });
});

describe("durum uç noktası", () => {
  it("bugünkü talep: BEKLIYOR, GORULDU, KARSILANDI, IPTAL; personel adı, iç not ve fiyat yok", async () => {
    const w = await minibarWorld();
    const get = () => guest.guestRequestStatus({ token: w.room.qrToken!, locale: "tr", ip: "1.1.1.1", userAgent: "t" });
    expect((await get()).request).toBeNull();
    const r = await submit(w);
    const kat = await staff("R-KAT");
    expect((await get()).request?.status).toBe("BEKLIYOR");
    await testDb.mybarRequest.update({ where: { id: r.requestId }, data: { seenAt: new Date(), seenById: kat.userId } });
    expect((await get()).request?.status).toBe("GORULDU");
    await testDb.mybarRequest.update({
      where: { id: r.requestId },
      data: { status: "TAMAMLANDI", completedById: kat.userId, completedAt: new Date() },
    });
    const done = await get();
    expect(done.request?.status).toBe("KARSILANDI");
    expect(JSON.stringify(done)).not.toMatch(/Test r-kat|fullName|price|seenBy|completedBy/i);
    await testDb.mybarRequest.update({
      where: { id: r.requestId },
      data: { status: "IPTAL", cancelledAt: new Date(), cancelNote: "iç not" },
    });
    const cancelled = await get();
    expect(cancelled.request?.status).toBe("IPTAL");
    expect(JSON.stringify(cancelled)).not.toContain("iç not");
  });
});

describe("route", () => {
  const call = (token: string, body: unknown, raw?: string) =>
    POST(
      new Request("http://x/api/q/t/mybar", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "7.7.7.7" },
        body: raw ?? JSON.stringify(body),
      }),
      { params: Promise.resolve({ token }) },
    );

  it("200 ok, geçersiz token 404, 17 KB gövde 413; gövdedeki hotelId yok sayılır", async () => {
    const w = await minibarWorld();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const res = await call(w.room.qrToken!, {
      idempotencyKey: randomUUID(),
      locale: "tr",
      items: [{ productId: w.cola.id, qty: 1 }],
      hotelId: other.hotelId,
      roomId: other.room.id,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: json.data.requestId } });
    expect(row.roomId).toBe(w.room.id);
    const bad = await call("yok-boyle-bir-token", { idempotencyKey: randomUUID(), locale: "tr", items: [], note: "x" });
    expect(bad.status).toBe(404);
    const big = await call(w.room.qrToken!, null, JSON.stringify({ note: "x".repeat(17 * 1024) }));
    expect(big.status).toBe(413);
  });

  it("GET durum", async () => {
    const w = await minibarWorld();
    const res = await GET(new Request("http://x/api/q/t/mybar?locale=tr"), {
      params: Promise.resolve({ token: w.room.qrToken! }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.request).toBeNull();
  });
});
