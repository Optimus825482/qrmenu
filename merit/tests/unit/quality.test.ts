import { describe, expect, it } from "vitest";
import { MENU_THEMES } from "../../prisma/seed/menuThemes";
import { contrastRatio } from "@/modules/menu/contrast";
import { templatePreset } from "@/modules/menu/design";
import { blockingFindings, evaluateQuality, type QualityItem } from "@/modules/menu/quality";

const design = (options: Record<string, unknown> = {}) => {
  const base = templatePreset("ROYAL");
  return { ...base, options: { ...base.options, ...options } } as ReturnType<typeof templatePreset>;
};
const item = (over: Partial<QualityItem> = {}): QualityItem => ({
  detail: null,
  imageUrl: null,
  allergens: ["gluten"],
  tags: [],
  translationLangs: ["en", "de", "ru", "ar"],
  ...over,
});
const white = { bg: "#ffffff", accent: "#0a6ea8", soft: "#e3f1fa", textOnAccent: "#ffffff" };
const ids = (findings: { id: string }[]) => findings.map((f) => f.id);

describe("contrastRatio", () => {
  it("siyah-beyaz 21, açık gri-beyaz 4.5 altı", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 0);
  });
});

describe("evaluateQuality", () => {
  it("her yerleşik tema engelsiz ve metin/düğme uyarısızdır", () => {
    for (const theme of MENU_THEMES) {
      expect(blockingFindings(design(), theme), theme.name).toEqual([]);
      const found = ids(evaluateQuality({ design: design(), theme, items: [] }));
      expect(found, theme.name).not.toContain("text-contrast");
      expect(found, theme.name).not.toContain("button-contrast");
    }
  });

  it("gri üstüne gri düğme engeldir", () => {
    const theme = { bg: "#808080", accent: "#858585", soft: "#8a8a8a", textOnAccent: "#888888" };
    const blocking = blockingFindings(design(), theme);
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.every((f) => f.level === "block")).toBe(true);
  });

  it("4.5 ile 3 arası uyarıdır, engel değildir", () => {
    const theme = { bg: "#7a7a7a", accent: "#ffffff", soft: "#8a8a8a", textOnAccent: "#7a7a7a" };
    const findings = evaluateQuality({ design: design(), theme, items: [] });
    expect(findings.find((f) => f.id === "text-contrast")?.level).toBe("warn");
    expect(blockingFindings(design(), theme)).toEqual([]);
  });

  it("fotoğraf yoğunluğu: dörtten fazla görsel ve küratörlük kapalı bilgi verir", () => {
    const items = Array.from({ length: 5 }, () => item({ imageUrl: "/uploads/a.webp" }));
    expect(ids(evaluateQuality({ design: design({ curatedPhotos: false }), theme: white, items }))).toContain("photo-density");
    expect(ids(evaluateQuality({ design: design({ curatedPhotos: true }), theme: white, items }))).not.toContain("photo-density");
  });

  it("çeviri eksikliği %20'yi aşınca uyarır ve dili adıyla söyler", () => {
    const items = [
      ...Array.from({ length: 7 }, () => item()),
      ...Array.from({ length: 3 }, () => item({ translationLangs: ["en", "de", "ru"] })),
    ];
    const found = evaluateQuality({ design: design(), theme: white, items }).find((f) => f.id === "translations");
    expect(found?.level).toBe("warn");
    expect(found?.message).toContain("Arapça");
    const one = [...Array.from({ length: 9 }, () => item()), item({ translationLangs: ["en", "de", "ru"] })];
    expect(ids(evaluateQuality({ design: design(), theme: white, items: one }))).not.toContain("translations");
  });

  it("alerjen: ikonlar açıkken boş alerjenli ürün uyarır, kapalıyken uyarmaz", () => {
    const items = [item({ allergens: [] })];
    expect(evaluateQuality({ design: design({ showAllergens: true }), theme: white, items }).find((f) => f.id === "allergens")?.level).toBe("warn");
    expect(ids(evaluateQuality({ design: design({ showAllergens: false }), theme: white, items }))).not.toContain("allergens");
  });

  it("140 karakteri aşan açıklama bilgi verir ve ilgili ürünleri affectedItems içinde listeler", () => {
    const items = [item({ id: "inci-1", name: "İNCİ", categoryPath: "SNACK MENÜ › GÜN BATIMI", detail: "x".repeat(141) })];
    const finding = evaluateQuality({ design: design(), theme: white, items }).find((f) => f.id === "long-detail");
    expect(finding?.level).toBe("info");
    expect(finding?.affectedItems).toHaveLength(1);
    expect(finding?.affectedItems?.[0]).toMatchObject({
      id: "inci-1",
      name: "İNCİ",
      categoryPath: "SNACK MENÜ › GÜN BATIMI",
    });
  });

  it("alerjen ve çeviri bulguları eksik olan ürünleri ve akıllı alerjen önerilerini döndürür", async () => {
    const { ALLERGEN_PRESETS, inferAllergensForItem, shortenMenuDetail } = await import("@/modules/menu/allergens");
    expect(ALLERGEN_PRESETS.length).toBeGreaterThanOrEqual(15);

    const inferred = inferAllergensForItem({ name: "CAPPUCCINO", categoryPath: "SICAK İÇECEKLER" });
    expect(inferred.allergens).toContain("sut");

    const items = [
      item({ id: "capp-1", name: "CAPPUCCINO", categoryPath: "SICAK İÇECEKLER", allergens: [], translationLangs: ["en"] }),
    ];
    const findings = evaluateQuality({ design: design({ showAllergens: true }), theme: white, items });
    const algFinding = findings.find((f) => f.id === "allergens");
    expect(algFinding?.affectedItems?.[0].name).toBe("CAPPUCCINO");
    expect(algFinding?.affectedItems?.[0].suggestedAllergens).toContain("sut");

    const transFinding = findings.find((f) => f.id === "translations");
    expect(transFinding?.affectedItems?.[0].missingLangs).toEqual(["Almanca", "Rusça", "Arapça"]);

    const short = shortenMenuDetail("Sıcak ekmek, tulum peyniri (MEZELER: Girit Ezmesi, Deniz Börülcesi, Levrek Marin, Babagannuş · SALATA: Karpuzlu Ezine Salatası · ARA SICAK: Karides Güveç)", 135);
    expect(short.length).toBeLessThanOrEqual(135);
  });
});
