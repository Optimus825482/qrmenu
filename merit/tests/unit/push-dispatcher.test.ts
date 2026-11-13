import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { startRealtimeListener, stopRealtimeListener, subscribe, listenerCount } = await import("@/lib/realtime");
const { isPushConfigured, setPushSenderForTests, setVapidForTests, sendPush, serializePayload } = await import(
  "@/lib/push"
);
const { dispatchNotificationEvent, startPushDispatcher, PUSH_TYPES } = await import(
  "@/modules/core/server/pushDispatcher"
);
const { notify, listMyNotifications } = await import("@/modules/core/server/notifications");
const { notifyNewRequest } = await import("@/modules/mybar/server/fanout");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VAPID = { publicKey: "BPublic", privateKey: "private", subject: "mailto:it@example.test" };

type Sent = { endpoint: string; json: string };
let sent: Sent[] = [];
let behavior: (endpoint: string) => Promise<void> = async () => {};
let captured: MeritEvent[] = [];
let off: () => void = () => {};

beforeAll(async () => {
  await resetReferenceData();
  await startRealtimeListener();
});
beforeEach(async () => {
  await resetTestData();
  setVapidForTests(VAPID);
  sent = [];
  captured = [];
  behavior = async () => {};
  setPushSenderForTests(async (target, json) => {
    sent.push({ endpoint: target.endpoint, json });
    await behavior(target.endpoint);
  });
  off = subscribe(
    (e) => e.type === "notification.created",
    (e) => captured.push(e),
  );
});
afterEach(() => {
  off();
  setVapidForTests(undefined);
  setPushSenderForTests(null);
});
afterAll(async () => {
  await stopRealtimeListener();
  await dropReferenceData();
  await testDb.$disconnect();
});

async function addSub(userId: string, n: string) {
  return testDb.pushSubscription.create({
    data: { userId, endpoint: `https://push.example.test/${n}`, p256dh: "k", auth: "a" },
  });
}

async function openSession(userId: string, roleId: string, status: "ONLINE" | "CIKTI" = "ONLINE", expiresInMs = 3_600_000) {
  return testDb.userSession.create({
    data: { userId, hotelId: await hotelId("ROYAL"), roleId, status, expiresAt: new Date(Date.now() + expiresInMs), ip: "127.0.0.1", userAgent: "vitest" },
  });
}

async function setup() {
  const a = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
  const b = await makeUser({ username: "dep1", roleCode: "R-DEP", hotelCode: "ROYAL" });
  for (const u of [a, b]) await openSession(u.id, u.roleId);
  await addSub(a.id, "a1");
  await addSub(a.id, "a2");
  return { a, b, mr: await hotelId("ROYAL") };
}

async function fire(refId = "req1", note = "") {
  const { a, b, mr } = await setup();
  await testDb.$transaction((tx) =>
    notifyNewRequest(tx, {
      id: refId,
      hotelId: mr,
      roomNumber: "101",
      floorName: "1. Kat",
      items: [{ name: "Su", qty: 2 }],
      note,
    }),
  );
  await sleep(300);
  const event = captured.find((e) => (e.payload as { refId?: string })?.refId === refId)!;
  return { a, b, mr, event };
}

describe("dispatchNotificationEvent", () => {
  it("2 cihaza gönderir (abonesiz kullanıcı atlanır), pushedAt dolar, yük sözleşmesi", async () => {
    const { event } = await fire("req1");
    expect(event).toBeDefined();
    const result = await dispatchNotificationEvent(event);
    expect(result).toMatchObject({ sent: 2, gone: 0, failed: 0 });
    expect(result.claimed).toBe(event.userIds!.length);
    expect(sent).toHaveLength(2);
    const payload = JSON.parse(sent[0]!.json);
    expect(payload).toEqual({
      title: "Yeni MyBar talebi",
      body: "Talebi görmek için Merit OS'i açın.",
      url: "/kat/mybar?focus=req1",
      tag: "mybar-req1",
    });
    expect(Buffer.byteLength(sent[0]!.json)).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(payload)).not.toMatch(/price|guest/i);
    const rows = await testDb.notification.findMany({ where: { type: "mybar.created" } });
    expect(rows.every((r) => r.pushedAt !== null)).toBe(true);
  });

  it("oda, ürün ve misafir notunu yalnız uygulama içi bildirimde tutar", async () => {
    const { event } = await fire("req2", "Misafirin özel notu");
    await dispatchNotificationEvent(event);
    expect(sent[0]!.json).not.toMatch(/101|Su ×2|Misafirin özel notu/);
    const notification = await testDb.notification.findFirstOrThrow({ where: { refId: "req2" } });
    expect(notification.body).toContain("Oda 101");
    expect(notification.body).toContain("Su ×2");
    expect(notification.body).toContain("Misafirin özel notu");
  });

  it("aynı olay iki kez eşzamanlı verilirse yalnız bir kez gönderilir", async () => {
    const { event } = await fire("req3");
    const [r1, r2] = await Promise.all([dispatchNotificationEvent(event), dispatchNotificationEvent(event)]);
    expect(sent).toHaveLength(2);
    expect(r1.sent + r2.sent).toBe(2);
  });

  it("410 aboneliği siler, diğeri gider", async () => {
    const { event } = await fire("req4");
    behavior = async (endpoint) => {
      if (endpoint.endsWith("/a1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    const result = await dispatchNotificationEvent(event);
    expect(result).toMatchObject({ sent: 1, gone: 1, failed: 0 });
    const left = await testDb.pushSubscription.findMany();
    expect(left.map((s) => s.endpoint)).toEqual(["https://push.example.test/a2"]);
  });

  it("başarısızlık failCount artırır, 5. başarısızlıkta aboneliği siler", async () => {
    const { a } = await setup();
    await testDb.pushSubscription.deleteMany({ where: { endpoint: { endsWith: "/a2" } } });
    behavior = async () => {
      throw new Error("503");
    };
    for (let i = 1; i <= 5; i += 1) {
      await notify({ recipients: [a.id], type: "mybar.created", title: "t", body: "b", refId: `f${i}` });
      await sleep(250);
      const ev = captured.find((e) => (e.payload as { refId?: string })?.refId === `f${i}`)!;
      await dispatchNotificationEvent(ev);
      const row = await testDb.pushSubscription.findFirst({ where: { endpoint: { endsWith: "/a1" } } });
      if (i < 5) expect(row?.failCount).toBe(i);
      else expect(row).toBeNull();
    }
  });

  it("başarılı gönderim failCount sıfırlar ve lastUsedAt yeniler", async () => {
    const { event } = await fire("req5");
    const old = new Date(Date.now() - 3600_000);
    await testDb.pushSubscription.updateMany({ data: { failCount: 3, lastUsedAt: old } });
    await dispatchNotificationEvent(event);
    const rows = await testDb.pushSubscription.findMany();
    expect(rows.every((r) => r.failCount === 0 && r.lastUsedAt > old)).toBe(true);
  });

  it("gönderici eşzamanlı throw ederse dispatch reddetmez", async () => {
    const { event } = await fire("req6");
    setPushSenderForTests(() => {
      throw new Error("sync boom");
    });
    await expect(dispatchNotificationEvent(event)).resolves.toMatchObject({ failed: 2 });
  });

  it("onay yükseltme ve SLA uyarıları push türü olarak kayıtlı", () => {
    for (const type of ["order.escalated", "order.sla.warn", "order.sla.breach"]) {
      expect(PUSH_TYPES.has(type)).toBe(true);
    }
    expect(PUSH_TYPES.get("order.sla.breach")!({ refId: "o1", title: "T", body: "B" })).toMatchObject({ title: "T", url: "/oda-servisi" });
  });

  it("masa çağrısı (call.created) push türü kayıtlı; kilit ekranı için gizlilik korur", () => {
    expect(PUSH_TYPES.has("call.created")).toBe(true);
    const payload = PUSH_TYPES.get("call.created")!({
      refId: "call1",
      // The in-app notification text may name the outlet and table; the push must not.
      title: "Garson çağrısı · Royal Lobi Masa 12",
      body: "Hesap lütfen",
    });
    expect(payload).toEqual({
      title: "Masa çağrısı",
      body: "Yeni bir masa çağrısı var; çağrı panelini açın.",
      url: "/garson/cagrilar",
      tag: "call-created-call1",
    });
    expect(JSON.stringify(payload)).not.toMatch(/Masa 12|Hesap lütfen|Royal Lobi/);
  });

  it("call.created gerçek dispatch yolunda gönderilir; push metni masa/not taşımaz", async () => {
    const { a } = await setup();
    await notify({
      recipients: [a.id],
      type: "call.created",
      title: "Garson çağrısı · Masa 12",
      body: "Hesap lütfen",
      refType: "WaiterCall",
      refId: "wc1",
    });
    await sleep(300);
    const event = captured.find((e) => (e.payload as { refId?: string })?.refId === "wc1")!;
    expect(event).toBeDefined();
    const result = await dispatchNotificationEvent(event);
    expect(result).toMatchObject({ sent: 2, gone: 0, failed: 0 });
    const sentPayload = JSON.parse(sent[0]!.json);
    expect(sentPayload.url).toBe("/garson/cagrilar");
    expect(sentPayload.tag).toBe("call-created-wc1");
    expect(sent[0]!.json).not.toMatch(/Masa 12|Hesap lütfen/);
    const rows = await testDb.notification.findMany({ where: { type: "call.created" } });
    expect(rows.every((r) => r.pushedAt !== null)).toBe(true);
  });

  it("minibar uyarıları (DND, kritik stok) push türü olarak kayıtlı ve zil etiketiyle aynı etiketi taşır", () => {
    for (const type of ["dnd.marked", "dnd.reminder", "dnd.dayend", "stock.critical"]) {
      expect(PUSH_TYPES.get(type)!({ refId: "r1", title: "T", body: "B" })).toMatchObject({ title: "T", body: "B", tag: `merit-${type}-r1` });
    }
    expect(PUSH_TYPES.get("stock.critical")!({ refId: null, title: "T", body: "B" }).url).toBe("/kat/stok");
  });

  it("kayıtsız tür: claimed 0, gönderim yok", async () => {
    const { a } = await setup();
    await notify({ recipients: [a.id], type: "session.warn", title: "t", body: "b", refId: "s1" });
    await sleep(300);
    const ev = captured.find((e) => (e.payload as { type?: string })?.type === "session.warn")!;
    expect(PUSH_TYPES.has("session.warn")).toBe(false);
    expect(await dispatchNotificationEvent(ev)).toMatchObject({ claimed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("VAPID yok: claimed 0, pushedAt null kalır, bildirim zilde görünür (geri düşüş)", async () => {
    const { event, a } = await fire("req7");
    setVapidForTests(null);
    expect(isPushConfigured()).toBe(false);
    expect(await dispatchNotificationEvent(event)).toMatchObject({ claimed: 0, sent: 0 });
    expect(sent).toHaveLength(0);
    const rows = await testDb.notification.findMany({ where: { type: "mybar.created" } });
    expect(rows.every((r) => r.pushedAt === null && r.isRead === false)).toBe(true);
    const ctx = await ctxFor(a, { hotelCode: "ROYAL" });
    expect((await listMyNotifications(ctx)).map((n) => n.type)).toContain("mybar.created");
  });

  it("abonesiz kullanıcının bildirimi okunmamış ve listede kalır", async () => {
    const { event, b } = await fire("req8");
    await dispatchNotificationEvent(event);
    const ctx = await ctxFor(b, { hotelCode: "ROYAL" });
    const list = await listMyNotifications(ctx);
    expect(list.find((n) => n.type === "mybar.created")?.isRead).toBe(false);
  });
});

describe("yalnız aktif oturumlu kullanıcılar", () => {
  it("oturumu kapalı ya da süresi dolmuş kullanıcıya gönderilmez ve pushedAt boş kalır", async () => {
    const { event, a, b } = await fire("req-s");
    await testDb.userSession.updateMany({ where: { userId: a.id }, data: { status: "CIKTI" } });
    await testDb.userSession.updateMany({ where: { userId: b.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await dispatchNotificationEvent(event)).toMatchObject({ claimed: 0, sent: 0 });
    expect(sent).toHaveLength(0);
    const rows = await testDb.notification.findMany({ where: { type: "mybar.created" } });
    expect(rows.every((r) => r.pushedAt === null)).toBe(true);
  });
});

describe("startPushDispatcher", () => {
  it("gerçek notify sonrası ≤ 2 sn içinde gönderir; idempotent; durdurulabilir", async () => {
    const { a } = await setup();
    const before = listenerCount();
    const stop = startPushDispatcher();
    const stop2 = startPushDispatcher();
    expect(listenerCount()).toBe(before + 1);
    await notify({ recipients: [a.id], type: "mybar.created", title: "T", body: "B", refId: "live1" });
    for (let i = 0; i < 20 && sent.length < 2; i += 1) await sleep(100);
    expect(sent).toHaveLength(2);
    stop2();
    expect(listenerCount()).toBe(before);
    stop();
  });
});

describe("lib/push", () => {
  it("404/410 GONE, diğer hata FAILED, asla fırlatmaz", async () => {
    const target = { endpoint: "https://push.example.test/z", p256dh: "k", auth: "a" };
    const payload = { title: "t", body: "b", url: "/" };
    setPushSenderForTests(async () => {
      throw Object.assign(new Error("x"), { statusCode: 404 });
    });
    expect(await sendPush(target, payload)).toBe("GONE");
    setPushSenderForTests(async () => {
      throw new Error("net");
    });
    expect(await sendPush(target, payload)).toBe("FAILED");
    setPushSenderForTests(async () => {});
    expect(await sendPush(target, payload)).toBe("SENT");
  });

  it("1 KB üstü yük gövdeyi kısaltır", () => {
    const json = serializePayload({ title: "t", body: "ö".repeat(2000), url: "/x", tag: "mybar-1" });
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(1024);
    expect(JSON.parse(json).url).toBe("/x");
  });
});
