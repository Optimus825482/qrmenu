import { describe, expect, it } from "vitest";
import { AMBIENCES, DESIGN_TEMPLATES, designFromStored, NEUTRAL_NEW_OPTIONS, templatePreset } from "@/modules/menu/design";

describe("yeni tasarım seçenekleri", () => {
  it("boş seçenekli kayıt şablonun yeni alanlarını kullanır", () => {
    expect(designFromStored({ template: "GOURMET", options: {} }).options).toMatchObject({
      typography: "EDITORIAL",
      density: "AIRY",
    });
  });

  it("kayıtlı eski seçenekte eksik yeni anahtarlar nötr varsayılana düşer", () => {
    const { options } = designFromStored({ template: "GRANDE", options: { cardStyle: "LIST", showPrices: false } });
    expect(options).toMatchObject(NEUTRAL_NEW_OPTIONS);
    expect(options.showPrices).toBe(false);
  });

  it("bozuk yeni değerler nötre düşer", () => {
    const { options } = designFromStored({
      template: "GOURMET",
      options: { cardStyle: "LIST", typography: "COMIC", density: 7, hero: "X", heroImageUrl: 42, curatedPhotos: "yes" },
    });
    expect(options).toMatchObject(NEUTRAL_NEW_OPTIONS);
  });

  it("heroImageUrl yalnız /uploads/ ile başlıyorsa korunur", () => {
    const stored = (heroImageUrl: unknown) =>
      designFromStored({ template: "ROYAL", options: { cardStyle: "LIST", heroImageUrl } }).options.heroImageUrl;
    expect(stored("/uploads/menu/a.webp")).toBe("/uploads/menu/a.webp");
    expect(stored("https://evil.example/x.png")).toBe("");
    expect(stored(`/uploads/${"a".repeat(300)}`)).toBe("");
  });

  it("callWaiterPosition geçerli değerleri korur, bozuk değerleri STICKY_FOOTER'a düşürür", () => {
    expect(
      designFromStored({ template: "ROYAL", options: { cardStyle: "LIST", callWaiterPosition: "STICKY_HEADER" } }).options
        .callWaiterPosition,
    ).toBe("STICKY_HEADER");
    expect(
      designFromStored({ template: "ROYAL", options: { cardStyle: "LIST", callWaiterPosition: "HERO_BOTTOM" } }).options
        .callWaiterPosition,
    ).toBe("HERO_BOTTOM");
    expect(
      designFromStored({ template: "ROYAL", options: { cardStyle: "LIST", callWaiterPosition: "INVALID" } }).options
        .callWaiterPosition,
    ).toBe("STICKY_FOOTER");
  });
});

describe("logo boyutu ve hizası", () => {
  const LOGO = "/uploads/menu-logo/abc123/0123456789abcdef.webp";
  const stored = (options: Record<string, unknown>) =>
    designFromStored({ template: "ROYAL", options: { cardStyle: "LIST", ...options } }).options;

  it("varsayılan bugünkü görünümdür: orta boy, ortalı", () => {
    expect(NEUTRAL_NEW_OPTIONS).toMatchObject({ logoSize: "MEDIUM", logoAlign: "CENTER" });
    expect(templatePreset("ROYAL").options).toMatchObject({ logoSize: "MEDIUM", logoAlign: "CENTER" });
  });

  it("geçerli değerleri korur", () => {
    for (const logoSize of ["SMALL", "MEDIUM", "LARGE", "FULL"]) {
      expect(stored({ logoUrl: LOGO, logoSize }).logoSize).toBe(logoSize);
    }
    for (const logoAlign of ["LEFT", "CENTER", "RIGHT"]) {
      expect(stored({ logoUrl: LOGO, logoAlign }).logoAlign).toBe(logoAlign);
    }
  });

  it("bozuk değerler varsayılana düşer", () => {
    for (const junk of ["HUGE", "full", 7, null, {}]) {
      expect(stored({ logoSize: junk, logoAlign: junk })).toMatchObject({ logoSize: "MEDIUM", logoAlign: "CENTER" });
    }
  });

  it("seçenekten önce kaydedilmiş logo eski yerinde kalır: karşılama hizasını izler, karşılama yoksa ortalıdır", () => {
    expect(stored({ logoUrl: LOGO })).toMatchObject({ logoSize: "MEDIUM", logoAlign: "LEFT" });
    expect(stored({ logoUrl: LOGO, heroAlign: "center" }).logoAlign).toBe("CENTER");
    expect(stored({ logoUrl: LOGO, heroAlign: "right", logoAlign: "X" }).logoAlign).toBe("RIGHT");
    expect(stored({ logoUrl: LOGO, hero: "NONE" }).logoAlign).toBe("CENTER");
    // An explicit choice always wins over the hero alignment.
    expect(stored({ logoUrl: LOGO, heroAlign: "right", logoAlign: "LEFT" }).logoAlign).toBe("LEFT");
  });
});

describe("designFromStored", () => {
  it("boş kayıt Royal şablonuna düşer", () => {
    expect(designFromStored(null)).toMatchObject({
      template: "ROYAL",
      layout: ["hero", "categories", "items"],
      options: { cardStyle: "LIST", showImages: true, showAllergens: true },
    });
  });

  it("boş seçenekler şablonun hazır ayarını kullanır", () => {
    expect(designFromStored({ template: "GOURMET", options: {} }).options).toMatchObject({
      cardStyle: "LIST",
      showImages: false,
      uppercaseCategories: true,
    });
  });

  it("MEN-9: hero renkleri yalnız #rrggbb kabul eder", () => {
    const ok = designFromStored({ template: "ROYAL", options: { heroBgColor: " #A1b2C3 ", heroTextColor: "#000000" } });
    expect(ok.options.heroBgColor).toBe("#A1b2C3");
    expect(ok.options.heroTextColor).toBe("#000000");
    const bad = designFromStored({
      template: "ROYAL",
      options: { heroBgColor: "red;background:url(x)", heroTextColor: "#fff" },
    });
    expect(bad.options.heroBgColor).toBe("");
    expect(bad.options.heroTextColor).toBe("");
    expect(designFromStored({ template: "ROYAL", options: { heroBgColor: "" } }).options.heroBgColor).toBe("");
  });

  it("kayıtlı geçerli düzeni korur, bozuk değeri şablona düşürür", () => {
    const design = designFromStored({
      template: "POOL_CLUB",
      layout: ["categories", "hero", "items"],
      options: { cardStyle: "NOPE", showPrices: false, featuredTitle: "  Şef  " },
    });
    expect(design.layout).toEqual(["categories", "hero", "items"]);
    expect(design.options.cardStyle).toBe("PHOTO");
    expect(design.options.showPrices).toBe(false);
    expect(design.options.featuredTitle).toBe("Şef");
  });

  it("kategori gezintisi ürünlerin altına düşerse otomatik olarak başa alınır", () => {
    const design = designFromStored({
      template: "POOL_CLUB",
      layout: ["items", "hero", "categories"],
    });
    expect(design.layout).toEqual(["hero", "categories", "items"]);
  });

  it("şablon hazır düzeni kategori gezintisini üste koyar", () => {
    expect(templatePreset("PATISSERIE")).toMatchObject({
      ambience: "CAFE",
      template: "PATISSERIE",
      options: { cardStyle: "PHOTO" },
      layout: ["hero", "categories", "items"],
    });
  });

  it("tüm ambiyanslar en az 3 farklı tasarım şablonuna sahiptir", () => {
    for (const amb of AMBIENCES) {
      const matching = DESIGN_TEMPLATES.filter((t) => t.ambience === amb.id);
      expect(
        matching.length,
        `Ambiyans "${amb.label}" (${amb.id}) en az 3 şablona sahip olmalı, bulunan: ${matching.length}`,
      ).toBeGreaterThanOrEqual(3);

      // Farklı yerleşim ve görsel seçenekleri kontrolü
      const styles = new Set(matching.map((t) => t.options.cardStyle));
      expect(styles.size, `Ambiyans "${amb.label}" birden fazla kart stili sunmalı`).toBeGreaterThanOrEqual(2);
    }
  });
});
