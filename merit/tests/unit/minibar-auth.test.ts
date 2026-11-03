import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const dashboard = await import("@/app/api/minibar/dashboard/route");
const roomRoute = await import("@/app/api/minibar/room/[roomId]/route");
const checkRoute = await import("@/app/api/minibar/room/[roomId]/check/route");
const dndRoute = await import("@/app/api/minibar/room/[roomId]/dnd/route");
const stockRoute = await import("@/app/api/minibar/depo/stock/route");
const productsRoute = await import("@/app/api/minibar/definitions/products/route");
const setupsRoute = await import("@/app/api/minibar/definitions/setups/route");
const setupItemsRoute = await import("@/app/api/minibar/definitions/setup-items/route");
const groupsRoute = await import("@/app/api/minibar/definitions/product-groups/route");
const roomTypeSetupsRoute = await import("@/app/api/minibar/definitions/room-type-setups/route");
const auditRoute = await import("@/app/api/minibar/definitions/audit-logs/route");
const consumptionRoute = await import("@/app/api/minibar/reports/consumption/route");
const uploadRoute = await import("@/app/api/minibar/occupancy/upload/route");
const confirmRoute = await import("@/app/api/minibar/mybar/confirm/route");
const myCheckRoute = await import("@/app/api/minibar/my-checks/[txId]/route");
const resolveRoute = await import("@/app/api/minibar/corrections/[requestId]/resolve/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const as = (ctx: Ctx) => requireUser.mockResolvedValue(ctx);
const url = (path: string) => `http://localhost/api/minibar/${path}`;
const json = (path: string, method: string, body: unknown) =>
  new Request(url(path), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

describe("oturumsuz istekler 401 alır (demo kullanıcıya düşmez)", () => {
  beforeEach(() => {
    requireUser.mockRejectedValue(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
  });

  it("örnek rotaların hepsi 401 döner ve veritabanına dokunmaz", async () => {
    const w = await minibarWorld();
    const before = await stockOf(w.hotelId, w.cola.id);

    const calls: Promise<Response>[] = [
      dashboard.GET(new Request(url("dashboard"))),
      roomRoute.GET(new Request(url("room/x")), params({ roomId: w.room.id })),
      checkRoute.POST(json("room/x/check", "POST", { consumedItems: [{ productId: w.cola.id, qty: 1 }] }), params({ roomId: w.room.id })),
      dndRoute.POST(json("room/x/dnd", "POST", {}), params({ roomId: w.room.id })),
      stockRoute.GET(new Request(url("depo/stock"))),
      stockRoute.POST(json("depo/stock", "POST", { productId: w.cola.id, changeQuantity: 50 })),
      productsRoute.GET(new Request(url("definitions/products"))),
      productsRoute.POST(json("definitions/products", "POST", { groupId: w.group.id, name: "x" })),
      setupsRoute.GET(),
      auditRoute.GET(new Request(url("definitions/audit-logs"))),
      consumptionRoute.GET(new Request(url("reports/consumption"))),
      uploadRoute.POST(new Request(url("occupancy/upload"), { method: "POST", body: new FormData() })),
      confirmRoute.POST(json("mybar/confirm", "POST", { requestId: "r1" })),
      myCheckRoute.DELETE(new Request(url("my-checks/t"), { method: "DELETE" }), params({ txId: "t" })),
      resolveRoute.POST(json("corrections/r/resolve", "POST", { approved: true }), params({ requestId: "r" })),
    ].map((p) => Promise.resolve(p));

    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(await stockOf(w.hotelId, w.cola.id)).toMatchObject({ remainingQty: before.remainingQty });
    expect(await testDb.minibarTransaction.count()).toBe(0);
  });
});

describe("otel kapsamı: kendi otelinin dışına erişilemez", () => {
  it("başka otelin odası, katı ve stoğu 403 verir; veri değişmez", async () => {
    const mine = await minibarWorld({ hotelCode: "ROYAL" });
    const theirs = await minibarWorld({ hotelCode: "DIAMOND", stock: 40 });
    const kat = await staff("R-KAT", "ROYAL");
    as(kat.ctx);

    // room services hide other hotels' rooms entirely (NOT_FOUND, no existence leak)
    expect((await roomRoute.GET(new Request(url("room/x")), params({ roomId: theirs.room.id }))).status).toBe(404);
    const check = await checkRoute.POST(
      json("room/x/check", "POST", { consumedItems: [{ productId: theirs.cola.id, qty: 1 }] }),
      params({ roomId: theirs.room.id }),
    );
    expect(check.status).toBe(404);
    expect((await dndRoute.POST(json("d", "POST", {}), params({ roomId: theirs.room.id }))).status).toBe(403);
    expect((await dashboard.GET(new Request(url(`dashboard?hotelId=${theirs.hotelId}`)))).status).toBe(403);
    expect((await stockRoute.GET(new Request(url(`depo/stock?hotelId=${theirs.hotelId}`)))).status).toBe(403);
    expect((await stockRoute.POST(json("depo/stock", "POST", { productId: theirs.cola.id, changeQuantity: 5, formHotelId: theirs.hotelId }))).status).toBe(403);
    expect((await stockOf(theirs.hotelId, theirs.cola.id)).remainingQty).toBe(40);
    expect(await testDb.minibarTransaction.count()).toBe(0);

    // own hotel works
    as(kat.ctx);
    expect((await roomRoute.GET(new Request(url("room/x")), params({ roomId: mine.room.id }))).status).toBe(200);
  });

  it("başka otelin işlem kaydı silinemez/güncellenemez", async () => {
    const theirs = await minibarWorld({ hotelCode: "DIAMOND" });
    const owner = await staff("R-KAT", "DIAMOND");
    const tx = await testDb.minibarTransaction.create({
      data: { hotelId: theirs.hotelId, roomId: theirs.room.id, userId: owner.userId, type: "SARFIYAT_YOK" },
    });
    const intruder = await staff("R-DEP", "ROYAL");
    as(intruder.ctx);
    const del = await myCheckRoute.DELETE(new Request(url("my-checks/t"), { method: "DELETE" }), params({ txId: tx.id }));
    expect(del.status).toBe(404);
    expect(await testDb.minibarTransaction.count({ where: { id: tx.id } })).toBe(1);
  });

  it("minibar modülü olmayan rol (garson) depo/tanım/doluluk yazamaz (matris)", async () => {
    const w = await minibarWorld();
    const waiter = await staff("R-GAR", "ROYAL");
    as(waiter.ctx);
    const adj = await stockRoute.POST(json("depo/stock", "POST", { productId: w.cola.id, changeQuantity: 5 }));
    expect(adj.status).toBe(403);
    expect((await productsRoute.POST(json("definitions/products", "POST", { groupId: w.group.id, name: "x" }))).status).toBe(403);
    expect((await dashboard.GET(new Request(url("dashboard")))).status).toBe(403);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
  });

  it("denetim kayıtları yalnız SISTEM/CR-DEN R ve otel kapsamlıdır", async () => {
    const royal = await hotelId("ROYAL");
    const diamond = await hotelId("DIAMOND");
    await testDb.auditLog.createMany({
      data: [
        { hotelId: royal, action: "A1", entity: "E" },
        { hotelId: diamond, action: "A2", entity: "E" },
        { action: "A3", entity: "E" },
      ],
    });

    const kat = await staff("R-KAT", "ROYAL");
    as(kat.ctx);
    expect((await auditRoute.GET(new Request(url("definitions/audit-logs")))).status).toBe(403);

    // a system administrator limited to ROYAL sees ROYAL and hotel-less rows, never DIAMOND
    const sys = await staff("R-SYS", "ROYAL");
    as(sys.ctx);
    const ok = await auditRoute.GET(new Request(url("definitions/audit-logs?limit=500")));
    expect(ok.status).toBe(200);
    const actions = ((await ok.json()) as { logs: { action: string }[] }).logs.map((l) => l.action);
    expect(actions).toContain("A1");
    expect(actions).toContain("A3");
    expect(actions).not.toContain("A2");

    expect((await auditRoute.GET(new Request(url(`definitions/audit-logs?hotelId=${diamond}`)))).status).toBe(403);
  });
});

describe("fiyatlar yalnız SISTEM/YONETIM'e görünür", () => {
  it("depo sorumlusu fiyat görmez, yönetici ve sistem yöneticisi görür", async () => {
    const w = await minibarWorld();

    const dep = await staff("R-DEP", "ROYAL");
    as(dep.ctx);
    const depProducts = (await (await productsRoute.GET(new Request(url("definitions/products")))).json()) as {
      products: { id: string; salePrice: number | null; purchasePrice: number | null }[];
    };
    const mine = depProducts.products.find((p) => p.id === w.cola.id)!;
    expect(mine.salePrice).toBeNull();
    expect(mine.purchasePrice).toBeNull();

    const depStock = (await (await stockRoute.GET(new Request(url("depo/stock")))).json()) as {
      stockItems: { productId: string; price?: number | null }[];
    };
    // Havuz fiyat taşımaz: fiyat görmeyen role alan 0/null gelir ya da hiç gelmez.
    expect([0, null, undefined]).toContain(depStock.stockItems.find((s) => s.productId === w.cola.id)?.price);

    const setups = (await (await setupsRoute.GET()).json()) as { setups: { items: { id: string; salePrice: number | null }[] }[] };
    const setupItems = setups.setups.flatMap((s) => s.items);
    expect(setupItems.length).toBeGreaterThan(0);
    expect(setupItems.every((i) => i.salePrice === null)).toBe(true);
    const oneSetup = w.setup.id;
    const itemsBody = (await (await setupItemsRoute.GET(new Request(url(`definitions/setup-items?setupId=${oneSetup}`)))).json()) as {
      items: { salePrice: number | null }[];
    };
    expect(itemsBody.items.length).toBeGreaterThan(0);
    expect(itemsBody.items.every((i) => i.salePrice === null)).toBe(true);
    const groupsBody = JSON.stringify(await (await groupsRoute.GET()).json());
    expect(groupsBody).not.toMatch(/[Pp]rice/);

    for (const role of ["R-OTM", "R-SYS"]) {
      const boss = await staff(role, "ROYAL");
      as(boss.ctx);
      const body = (await (await productsRoute.GET(new Request(url("definitions/products")))).json()) as {
        products: { id: string; salePrice: number | null; purchasePrice: number | null }[];
      };
      const p = body.products.find((x) => x.id === w.cola.id)!;
      expect(p.salePrice).toBe(3.5);
      expect(p.purchasePrice).toBe(2);
    }
  });

  it("global katalog yazımı yalnız SISTEM: YONETIM ve depo sorumlusu FORBIDDEN + denetim kaydı", async () => {
    const w = await minibarWorld();
    for (const role of ["R-OTM", "R-DEP"]) {
      const u = await staff(role, "ROYAL");
      as(u.ctx);
      const res = await productsRoute.POST(
        json("definitions/products", "POST", { groupId: w.group.id, name: `Yeni-${randomUUID()}`, salePrice: 99 }),
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe("FORBIDDEN");
    }
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThanOrEqual(2);

    const sys = await staff("R-SYS", "ROYAL");
    as(sys.ctx);
    const ok = await productsRoute.POST(
      json("definitions/products", "POST", { groupId: w.group.id, name: `Yeni-${randomUUID()}`, salePrice: 99 }),
    );
    expect(ok.status).toBe(200);
  });

  it("denetim günlüğündeki fiyatlar fiyat görmeyen role maskelenir", async () => {
    const royal = await hotelId("ROYAL");
    await testDb.auditLog.create({
      data: { hotelId: royal, action: "UPDATE", entity: "Product", after: { salePrice: 12.5, purchasePrice: 7, name: "x" } },
    });
    const dep = await staff("R-DEP", "ROYAL");
    as(dep.ctx);
    const res = await auditRoute.GET(new Request(url("definitions/audit-logs?limit=500")));
    if (res.status === 200) {
      const logs = ((await res.json()) as { logs: { after: Record<string, unknown> | null }[] }).logs;
      for (const l of logs) {
        if (l.after && "salePrice" in l.after) expect(l.after.salePrice).toBe(0);
        if (l.after && "purchasePrice" in l.after) expect(l.after.purchasePrice).toBe(0);
      }
    }
    const sys = await staff("R-SYS", "ROYAL");
    as(sys.ctx);
    const full = (await (await auditRoute.GET(new Request(url("definitions/audit-logs?limit=500")))).json()) as {
      logs: { entity: string; after: { salePrice?: number } | null }[];
    };
    expect(full.logs.find((l) => l.entity === "Product")?.after?.salePrice).toBe(12.5);
  });
});

describe("oda tipi–setup ataması otel eşleşmesi", () => {
  it("uyuşmayan hotelId NOT_FOUND; doğru otel atanır", async () => {
    const w = await minibarWorld();
    const diamond = await hotelId("DIAMOND");
    const sys = await staff("R-SYS", "ROYAL", ["DIAMOND"]);
    as(sys.ctx);
    const extra = await testDb.setup.create({
      data: { name: `S-${randomUUID().slice(0, 8)}`, items: { create: [{ productId: w.cola.id, qty: 1 }] } },
    });
    const bad = await roomTypeSetupsRoute.POST(
      json("definitions/room-type-setups", "POST", { hotelId: diamond, roomTypeId: w.roomType.id, setupId: extra.id }),
    );
    expect(bad.status).toBe(404);
    const good = await roomTypeSetupsRoute.POST(
      json("definitions/room-type-setups", "POST", { hotelId: w.hotelId, roomTypeId: w.roomType.id, setupId: extra.id }),
    );
    expect(good.status).toBe(200);
  });
});

describe("hata gövdesi iç mesaj sızdırmaz", () => {
  it("beklenmeyen hata 500 + genel mesaj", async () => {
    // a malformed context makes the handler throw a TypeError whose text must not reach the client
    requireUser.mockResolvedValue({ user: { id: "u" }, session: undefined, hotelIds: [] });
    const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await stockRoute.GET(new Request(url("depo/stock")));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Beklenmeyen bir hata oluştu");
    errLog.mockRestore();
  });
});
