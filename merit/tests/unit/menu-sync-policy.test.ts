import { describe, expect, it } from "vitest";
import { carryPanelEdits, decideMenuSync, menuStamp, panelItemLookup, type PanelItem } from "../../prisma/seed/menuSyncPolicy";

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

describe("carryPanelEdits: yeniden kurulan menü panel kayıtlarını korur", () => {
  const old = (extra: Partial<PanelItem> = {}): PanelItem => ({
    categoryName: "KAHVALTI",
    name: "Sağlıklı Kahvaltı",
    detail: "Ekşi mayalı ekmek",
    imageUrl: "/merit-menus/a.webp",
    imageUrls: ["/merit-menus/a.webp"],
    allergens: ["GLUTEN", "SUT"],
    tags: ["VEJETARYEN"],
    isAvailable: false,
    translations: [
      { lang: "en", name: "Healthy Breakfast", detail: null, isVerified: true },
      { lang: "de", name: "Gesundes Frühstück", detail: "Sauerteigbrot", isVerified: false },
    ],
    ...extra,
  });
  const fileItem = { detail: "Ekşi mayalı ekmek", imageUrl: "/merit-menus/b.webp", allergens: [] as string[], tags: [] as string[] };

  it("eski ürün yoksa dosyadaki değerler yazılır", () => {
    expect(carryPanelEdits(fileItem, undefined)).toEqual({
      allergens: [], tags: [], imageUrl: "/merit-menus/b.webp", imageUrls: ["/merit-menus/b.webp"], isAvailable: true, translations: [],
    });
  });

  it("alerjen, etiket ve Tükendi korunur; dosya fotoğrafı dosyayı izler", () => {
    const kept = carryPanelEdits(fileItem, old());
    expect(kept.allergens).toEqual(["GLUTEN", "SUT"]);
    expect(kept.tags).toEqual(["VEJETARYEN"]);
    expect(kept.isAvailable).toBe(false);
    expect(kept.imageUrl).toBe("/merit-menus/b.webp");
  });

  it("panelden yüklenen fotoğraf korunur", () => {
    const kept = carryPanelEdits(fileItem, old({ imageUrl: "/uploads/x.webp", imageUrls: ["/uploads/x.webp", "/uploads/y.webp"] }));
    expect(kept.imageUrl).toBe("/uploads/x.webp");
    expect(kept.imageUrls).toEqual(["/uploads/x.webp", "/uploads/y.webp"]);
  });

  it("panelde alerjen yoksa dosyadaki kullanılır", () => {
    expect(carryPanelEdits({ ...fileItem, allergens: ["YUMURTA"] }, old({ allergens: [] })).allergens).toEqual(["YUMURTA"]);
  });

  it("metin aynıysa İngilizce dışındaki çeviriler korunur; açıklama değiştiyse yeniden çevrilir", () => {
    expect(carryPanelEdits(fileItem, old()).translations.map((t) => t.lang)).toEqual(["de"]);
    expect(carryPanelEdits({ ...fileItem, detail: "Yeni açıklama" }, old()).translations).toEqual([]);
  });

  it("eşleme: aynı kategori + ad; kategori değiştiyse ad tekse eşlenir, çiftse eşlenmez", () => {
    const find = panelItemLookup([
      old(),
      old({ categoryName: "BAR", name: "Kola" }),
      old({ categoryName: "MİNİBAR", name: "Kola" }),
    ]);
    expect(find("KAHVALTI", "Sağlıklı Kahvaltı")?.categoryName).toBe("KAHVALTI");
    expect(find("BRUNCH", "Sağlıklı Kahvaltı")?.categoryName).toBe("KAHVALTI");
    expect(find("BAR", "Kola")?.categoryName).toBe("BAR");
    expect(find("İÇECEK", "Kola")).toBeUndefined();
    expect(find("KAHVALTI", "Yok")).toBeUndefined();
  });
});
