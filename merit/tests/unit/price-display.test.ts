import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { resolveCurrency, resolvePriceDisplay } = await import("@/modules/menu/server/priceDisplay");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await testDb.setting.deleteMany({});
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function outlet(priceDisplay: "INHERIT" | "SHOW" | "HIDE") {
  return { hotelId: await hotelId("ROYAL"), priceDisplay };
}

describe("resolvePriceDisplay", () => {
  it("varsayılan HIDE", async () => {
    expect(await resolvePriceDisplay(await outlet("INHERIT"))).toBe("HIDE");
  });

  it("sistem price.display=SHOW iken INHERIT outlet SHOW görür", async () => {
    await testDb.setting.create({ data: { hotelId: null, key: "price.display", value: "SHOW" } });
    expect(await resolvePriceDisplay(await outlet("INHERIT"))).toBe("SHOW");
  });

  it("otel satırı sistem satırını ezer", async () => {
    await testDb.setting.create({ data: { hotelId: null, key: "price.display", value: "SHOW" } });
    await testDb.setting.create({
      data: { hotelId: await hotelId("ROYAL"), key: "price.display", value: "HIDE" },
    });
    expect(await resolvePriceDisplay(await outlet("INHERIT"))).toBe("HIDE");
  });

  it("outlet SHOW, ayar HIDE olsa da SHOW; outlet HIDE, ayar SHOW olsa da HIDE", async () => {
    await testDb.setting.create({
      data: { hotelId: await hotelId("ROYAL"), key: "price.display", value: "HIDE" },
    });
    expect(await resolvePriceDisplay(await outlet("SHOW"))).toBe("SHOW");
    await testDb.setting.updateMany({ where: { key: "price.display" }, data: { value: "SHOW" } });
    expect(await resolvePriceDisplay(await outlet("HIDE"))).toBe("HIDE");
  });
});

describe("resolveCurrency (K3: outletin kendi para birimi)", () => {
  it("outlet varsayılanı EUR; outlet alanı neyse o; eski otel ayarı etkisiz", async () => {
    const mr = await hotelId("ROYAL");
    const o = await testDb.outlet.create({ data: { hotelId: mr, name: "Kur Bar", type: "BAR" } });
    try {
      expect(await resolveCurrency(o.id)).toBe("EUR");
      await testDb.setting.create({ data: { hotelId: mr, key: "price.currency", value: "USD" } });
      expect(await resolveCurrency(o.id)).toBe("EUR");
      await testDb.outlet.update({ where: { id: o.id }, data: { currency: "TRY" } });
      expect(await resolveCurrency(o.id)).toBe("TRY");
      expect(await resolveCurrency("yok")).toBe("EUR");
    } finally {
      await testDb.outlet.delete({ where: { id: o.id } });
    }
  });
});
