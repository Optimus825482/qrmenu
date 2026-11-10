import { describe, expect, it } from "vitest";
import { decideMenuSync, menuStamp } from "../../prisma/seed/menuSyncPolicy";

const base = { menuNodeCount: 10, forceReset: false, isCurrentV2Menu: false };

describe("Merit menü senkron kararı", () => {
  it("boş menü kurulur", () => {
    expect(decideMenuSync({ ...base, menuNodeCount: 0 })).toBe("rebuild");
  });
  it("veri dosyası değişmedikçe menüsü olan outlet'e dokunulmaz", () => {
    expect(decideMenuSync(base)).toBe("skip-keep");
  });
  it("uyumlu v2 menüde yalnız görseller yenilenir", () => {
    expect(decideMenuSync({ ...base, isCurrentV2Menu: true })).toBe("refresh-images");
  });
  it("zorla sıfırlama yeniden kurar", () => {
    expect(decideMenuSync({ ...base, forceReset: true })).toBe("rebuild");
  });
  it("veri dosyasında menü değiştiyse bayraksız yeniden kurulur", () => {
    expect(decideMenuSync({ ...base, datasetChanged: true })).toBe("rebuild");
    expect(decideMenuSync({ ...base, isCurrentV2Menu: true, datasetChanged: true })).toBe("rebuild");
  });
  it("veri dosyası aynıysa elle düzenlenmiş menüye dokunulmaz", () => {
    expect(decideMenuSync({ ...base, datasetChanged: false })).toBe("skip-keep");
  });
  it("damga yalnız menü içeriği, sürüm ya da para birimi değişince değişir", () => {
    const spec = { outletName: "Tea Lounge", items: [{ name: "ÇAY", price: 3 }] };
    const stamp = menuStamp(3, "USD", spec);
    expect(menuStamp(3, "USD", structuredClone(spec))).toBe(stamp);
    expect(menuStamp(3, "USD", { ...spec, items: [{ name: "ÇAY", price: 4 }] })).not.toBe(stamp);
    expect(menuStamp(4, "USD", spec)).not.toBe(stamp);
    expect(menuStamp(3, "EUR", spec)).not.toBe(stamp);
  });
});
