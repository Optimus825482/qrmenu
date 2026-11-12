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

/**
 * A setup product that is never part of the additions: requests that only exercise other rules take it out
 * in the same quantity as the additions, so the swap balance (additions <= removals) holds.
 */
const extraOf = new Map<string, string>();
async function swapProduct(w: World): Promise<string> {
  const known = extraOf.get(w.setup.id);
  if (known) return known;
  const p = await testDb.product.create({ data: { groupId: w.group.id, name: `Takas-${randomUUID().slice(0, 6)}` } });
  await testDb.setupItem.create({ data: { setupId: w.setup.id, productId: p.id, qty: 20 } });
  extraOf.set(w.setup.id, p.id);
  return p.id;
}

const submit = async (
  w: World,
  items: { productId: string; qty: number }[] = [{ productId: w.cola.id, qty: 1 }],
  over: Record<string, unknown> = {},
) => {
  const total = items.reduce((n, i) => n + i.qty, 0);
  const removals = over.removals ?? (total > 0 ? [{ productId: await swapProduct(w), qty: total }] : []);
  return guest.createGuestRequest({
    token: w.room.qrToken!,
    idempotencyKey: randomUUID(),
    locale: "tr",
    items,
    ip: "10.1.1.1",
    userAgent: "vitest",
    ...over,
    removals,
  } as never);
};

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

  it("doluluk listesi MyBar'ı kapatmaz: listede olmayan (boş görünen) oda da açık", async () => {
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
    const empty = await getRoomGuestState(b.id);
    expect(empty.mybarOpen).toBe(true);
    expect(empty.reason).toBeUndefined();
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

  it("alıcı yoksa bildirim yedek alıcıya (R-SYS) düşer", async () => {
    const w = await minibarWorld();
    const sys = await staff("R-SYS");
    const res = await submit(w);
    const rows = await testDb.notification.findMany({ where: { type: "mybar.created", refId: res.requestId } });
    expect(rows.map((n) => n.userId)).toEqual([sys.userId]);
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

  it("mybar.dailyMax: günlük sınır açıkken oda en çok o kadar giriş alır", async () => {
    const w = await minibarWorld();
    await setSetting(await sysAdmin(), "mybar.dailyMax", 2, w.hotelId);
    await submit(w);
    await submit(w);
    expect(await codeOf(submit(w))).toBe("DAILY_LIMIT");
    expect(await testDb.mybarRequest.count()).toBe(2);
  });

  it("anahtar yalnız aynı iş gününde tekrar oynatılır; eski günün anahtarı reddedilir", async () => {
    const w = await minibarWorld();
    const key = randomUUID();
    const first = await submit(w, undefined, { idempotencyKey: key });
    const again = await submit(w, undefined, { idempotencyKey: key });
    expect(again).toMatchObject({ requestId: first.requestId, duplicate: true });
    await testDb.mybarRequest.update({
      where: { id: first.requestId },
      data: { businessDate: new Date("2020-01-01T00:00:00Z") },
    });
    const err = await errOf(submit(w, undefined, { idempotencyKey: key }));
    expect(err.code).toBe("VALIDATION");
    expect(err.fieldErrors?.idempotencyKey).toBeTruthy();
    expect(await testDb.mybarRequest.count()).toBe(1);
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

  it("ürün setup'tan çıkarılmışsa VALIDATION ve ad; qty > 20 VALIDATION; tekrar eden ürün VALIDATION", async () => {
    const w = await minibarWorld({ setupQty: 2 });
    await testDb.setupItem.deleteMany({ where: { setupId: w.setup.id, productId: w.water.id } });
    const e = await errOf(submit(w, [{ productId: w.water.id, qty: 1 }]));
    expect(e.code).toBe("VALIDATION");
    expect(e.fieldErrors?.items).toEqual([w.water.name]);
    expect(await testDb.mybarRequest.count()).toBe(0);
    // An addition may exceed the setup quantity (the swap balance limits it); only the absolute cap of 20 applies.
    expect(await codeOf(submit(w, [{ productId: w.cola.id, qty: 21 }]))).toBe("VALIDATION");
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

describe("talep oluşturma: çıkarılacak ürünler (takas)", () => {
  it("çıkarılacak + eklenecek birlikte kaydedilir; bildirim iki listeyi de yazar; durum çıkarılanları döner", async () => {
    const w = await minibarWorld({ setupQty: 4 });
    await staff("R-KAT");
    const res = await submit(
      w,
      [{ productId: w.cola.id, qty: 2 }],
      { removals: [{ productId: w.water.id, qty: 3 }] },
    );
    const row = await testDb.mybarRequest.findUniqueOrThrow({
      where: { id: res.requestId },
      include: { items: true, removals: true },
    });
    expect(row.items.map((i) => [i.productId, i.requestedQty, i.deliveredQty])).toEqual([[w.cola.id, 2, 0]]);
    expect(row.removals.map((i) => [i.productId, i.requestedQty, i.removedQty])).toEqual([[w.water.id, 3, 0]]);
    const note = await testDb.notification.findFirstOrThrow({ where: { type: "mybar.created", refId: res.requestId } });
    expect(note.body).toContain(`Çıkarılacak: ${w.water.name} ×3.`);
    expect(note.body).toContain(`Eklenecek: ${w.cola.name} ×2.`);
    expect(note.body.indexOf("Çıkarılacak")).toBeLessThan(note.body.indexOf("Eklenecek"));
    const view = await guest.guestRequestStatus({ token: w.room.qrToken!, locale: "tr", ip: "1.1.1.1", userAgent: "t" });
    expect(view.request?.removals).toEqual([{ name: w.water.name, qty: 3 }]);
    expect(view.request?.items).toEqual([{ name: w.cola.name, qty: 2 }]);
  });

  it("yalnız çıkarılacak ürün geçerli bir taleptir (eklenecek yok)", async () => {
    const w = await minibarWorld();
    const res = await submit(w, [], { removals: [{ productId: w.water.id, qty: 1 }] });
    const row = await testDb.mybarRequest.findUniqueOrThrow({ where: { id: res.requestId }, include: { items: true, removals: true } });
    expect(row.items).toHaveLength(0);
    expect(row.removals).toHaveLength(1);
  });

  it("eklenecek adet çıkarılacak adedi aşarsa VALIDATION ve kayıt yazılmaz", async () => {
    const w = await minibarWorld({ setupQty: 4 });
    const e = await errOf(
      submit(w, [{ productId: w.cola.id, qty: 3 }], { removals: [{ productId: w.water.id, qty: 2 }] }),
    );
    expect(e.code).toBe("VALIDATION");
    expect(e.fieldErrors?.items).toBeTruthy();
    const none = await errOf(submit(w, [{ productId: w.cola.id, qty: 1 }], { removals: [] }));
    expect(none.code).toBe("VALIDATION");
    expect(await testDb.mybarRequest.count()).toBe(0);
  });

  it("çıkarılacak adet setup adedini aşarsa VALIDATION ve ürün adı döner", async () => {
    const w = await minibarWorld({ setupQty: 2 });
    const e = await errOf(submit(w, [], { removals: [{ productId: w.water.id, qty: 3 }] }));
    expect(e.code).toBe("VALIDATION");
    expect(e.fieldErrors?.removals).toEqual([w.water.name]);
    expect(await testDb.mybarRequest.count()).toBe(0);
  });

  it("aynı ürün hem çıkarılacak hem eklenecek olamaz; çıkarılacaklarda tekrar ve setup dışı ürün reddedilir", async () => {
    const w = await minibarWorld({ setupQty: 4 });
    expect(
      await codeOf(
        submit(
          w,
          [{ productId: w.cola.id, qty: 1 }],
          { removals: [{ productId: w.cola.id, qty: 2 }] },
        ),
      ),
    ).toBe("VALIDATION");
    expect(
      await codeOf(
        submit(w, [], {
          removals: [
            { productId: w.water.id, qty: 1 },
            { productId: w.water.id, qty: 1 },
          ],
        }),
      ),
    ).toBe("VALIDATION");
    const outside = await testDb.product.create({ data: { groupId: w.group.id, name: `Dışarı-${randomUUID().slice(0, 6)}` } });
    expect(await codeOf(submit(w, [], { removals: [{ productId: outside.id, qty: 1 }] }))).toBe("VALIDATION");
    expect(await testDb.mybarRequest.count()).toBe(0);
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

describe("durum uç noktası: kısmi kapanış ve gün aşımı", () => {
  const getOf = (w: World) => () =>
    guest.guestRequestStatus({ token: w.room.qrToken!, locale: "tr", ip: "1.1.1.1", userAgent: "t" });

  it("eksikle kapatılan talep misafire KISMEN görünür, tam kapanış KARSILANDI kalır", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const r = await submit(w);
    await testDb.mybarRequest.update({
      where: { id: r.requestId },
      data: { status: "TAMAMLANDI", completedById: kat.userId, completedAt: new Date(), closedWithMissing: true },
    });
    expect((await getOf(w)()).request?.status).toBe("KISMEN");
    await testDb.mybarRequest.update({ where: { id: r.requestId }, data: { closedWithMissing: false } });
    expect((await getOf(w)()).request?.status).toBe("KARSILANDI");
  });

  it("önceki günden kalan bekleyen talep gece yarısından sonra da görünür; kapanmış eski talep görünmez", async () => {
    const w = await minibarWorld();
    const r = await submit(w);
    await testDb.mybarRequest.update({
      where: { id: r.requestId },
      data: { businessDate: new Date("2020-01-01T00:00:00Z") },
    });
    const pending = await getOf(w)();
    expect(pending.request?.requestId).toBe(r.requestId);
    expect(pending.request?.status).toBe("BEKLIYOR");
    await testDb.mybarRequest.update({
      where: { id: r.requestId },
      data: { status: "TAMAMLANDI", completedAt: new Date() },
    });
    expect((await getOf(w)()).request).toBeNull();
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const dayStr = (n: number) => daysAgo(n).toISOString().slice(0, 10);
  const backdate = (id: string, days: number) =>
    testDb.mybarRequest.update({
      where: { id },
      data: { createdAt: daysAgo(days), businessDate: new Date(`${dayStr(days)}T00:00:00.000Z`) },
    });
  const stay = (w: World, arrivalDaysAgo: number) =>
    testDb.guestRecord.create({
      data: {
        hotelId: w.hotelId,
        roomId: w.room.id,
        batchCode: "t",
        guestCount: 2,
        kind: "IN_HOUSE",
        arrivalDate: new Date(`${dayStr(arrivalDaysAgo)}T00:00:00.000Z`),
        departureDate: new Date(`${dayStr(-5)}T00:00:00.000Z`),
      },
    });

  it("oda el değiştirdi: eski misafirin bekleyen talebi yeni misafire görünmez; aynı misafirin eski bekleyen talebi görünür", async () => {
    const w = await minibarWorld();
    const old = await submit(w);
    await backdate(old.requestId, 4); // previous guest, 4 days ago, still BEKLEMEDE
    await stay(w, 1); // the current guest arrived yesterday
    expect((await getOf(w)()).request).toBeNull();

    const mine = await submit(w);
    await testDb.mybarRequest.update({ where: { id: mine.requestId }, data: { createdAt: daysAgo(0.5) } });
    await testDb.mybarRequest.update({ where: { id: mine.requestId }, data: { businessDate: new Date(`${dayStr(1)}T00:00:00.000Z`) } });
    expect((await getOf(w)()).request?.requestId).toBe(mine.requestId);

    // a longer stay that started before the request keeps it visible
    await testDb.guestRecord.deleteMany({});
    await stay(w, 10);
    await backdate(mine.requestId, 3);
    expect((await getOf(w)()).request?.requestId).toBe(mine.requestId);
  });

  it("doluluk kaydı yoksa geriye bakış bir iş günüyle sınırlı: dünkü bekleyen görünür, 3 gün önceki görünmez", async () => {
    const w = await minibarWorld();
    const r = await submit(w);
    await backdate(r.requestId, 3);
    expect((await getOf(w)()).request).toBeNull();
    await testDb.mybarRequest.update({ where: { id: r.requestId }, data: { createdAt: daysAgo(0.9) } });
    expect((await getOf(w)()).request?.requestId).toBe(r.requestId);
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
      removals: [{ productId: w.water.id, qty: 1 }],
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
