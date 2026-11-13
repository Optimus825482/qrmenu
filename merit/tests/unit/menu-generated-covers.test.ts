import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COVER_IMAGE_PATTERN } from "@/modules/menu/design";
import { GENERATED_COVERS, OUTLET_DESIGN_PRESETS, ROOM_SERVICE_DESIGN_PRESETS } from "../../prisma/seed/menuDesigns";
import { MENU_THEMES } from "../../prisma/seed/menuThemes";
import { loadMeritMenusDataset } from "../../prisma/seed/meritMenus";
import { SEED_OUTLETS } from "../../prisma/seed/outlets";
import { COVERS } from "../../scripts/generate-menu-covers";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATION = ["20261114010000_uretilen_menu_kapaklari", "20261114020000_alakart_restoranlar_geri"]
  .map((dir) => readFileSync(path.join(ROOT, "prisma/migrations", dir, "migration.sql"), "utf8"))
  .join(" ");
const PRINTED_COVERS = ["Whiskey Lounge", "The Roof Garden", "Blue Sea Beach Bar"];

describe("üretilen menü kapakları", () => {
  const dataset = loadMeritMenusDataset();

  it("menüsü olan her satış noktasının bir kapağı var: basılı ya da üretilmiş", () => {
    for (const outlet of dataset.outlets) {
      const key = outlet.isRoomService ? `ODA_SERVISI:${outlet.hotelCode}` : outlet.outletName!;
      const printed = OUTLET_DESIGN_PRESETS[key]?.options?.hero === "COVER";
      expect(printed || key in GENERATED_COVERS, key).toBe(true);
      expect(printed && key in GENERATED_COVERS, `${key}: iki kapak`).toBe(false);
    }
    expect(Object.keys(GENERATED_COVERS).filter((k) => PRINTED_COVERS.includes(k))).toEqual([]);
  });

  it.each(Object.entries(GENERATED_COVERS))("%s: dosya yerinde, desene uyuyor ve migration'da yazılı", (_key, url) => {
    expect(COVER_IMAGE_PATTERN.test(url)).toBe(true);
    expect(existsSync(path.join(ROOT, "public", url))).toBe(true);
    expect(MIGRATION).toContain(`'${url}'`);
  });

  it("üretici betiğin listesi kapak eşlemesiyle aynı dosyaları üretir", () => {
    expect(COVERS.map((c) => `/merit-menus/kapak-${c.slug}.jpg`).sort()).toEqual(Object.values(GENERATED_COVERS).sort());
  });

  it.each(Object.entries(GENERATED_COVERS))("%s: kapak renkleri ve yazı tipi noktanın tema ve tasarımından gelir", (key, url) => {
    const cover = COVERS.find((c) => url.endsWith(`kapak-${c.slug}.jpg`))!;
    const preset = key.startsWith("ODA_SERVISI:") ? ROOM_SERVICE_DESIGN_PRESETS[key.split(":")[1]!]! : OUTLET_DESIGN_PRESETS[key]!;
    const theme = MENU_THEMES.find((t) => t.name === preset.theme)!;
    expect({ bg: cover.bg, accent: cover.accent, soft: cover.soft }).toEqual({ bg: theme.bg, accent: theme.accent, soft: theme.soft });
    expect(cover.font).toBe(preset.options?.heroFontFamily);
  });
});

describe("alakart restoranlar geri alındı", () => {
  const dataset = loadMeritMenusDataset();
  it.each([
    ["DIAMOND", "The Steakhouse"],
    ["ROYAL", "Royal Mandarin"],
    ["ROYAL", "Bella Merit"],
  ])("%s / %s: menüsü var, her ürün fiyatlı, tohumda tanımlı ve kaldırılanlar arasında değil", (hotelCode, name) => {
    const outlet = dataset.outlets.find((o) => o.hotelCode === hotelCode && o.outletName === name)!;
    expect(outlet.items.length).toBeGreaterThan(100);
    expect(outlet.items.every((i) => typeof i.price === "number" && i.price > 0)).toBe(true);
    expect(SEED_OUTLETS.some((o) => o.hotelCode === hotelCode && o.name === name)).toBe(true);
    expect(readFileSync(path.join(ROOT, "prisma/seed/meritMenus.ts"), "utf8")).not.toContain(`name: "${name}"`);
    for (const item of outlet.items) {
      if (item.imageUrl) expect(existsSync(path.join(ROOT, "public", item.imageUrl)), item.imageUrl).toBe(true);
    }
  });
});

describe("oda servisi: ölçüyle fiyatlanan içkiler", () => {
  const dataset = loadMeritMenusDataset();
  const SPIRITS = ["VOTKALAR", "CİNLER", "ROMLAR", "TEKİLALAR", "KONYAKLAR", "BOURBON & TENNESSEE VİSKİLER", "MALT VİSKİLER", "İSKOÇ VİSKİLER", "İRLANDA VİSKİLERİ"];

  it.each(dataset.outlets.filter((o) => o.isRoomService))("$hotelCode: fiyatın 5 cl için olduğu ürün açıklamasında yazar", (outlet) => {
    const spirits = outlet.items.filter((i) => SPIRITS.includes(i.catPath[0]!));
    expect(spirits.length).toBeGreaterThan(80);
    for (const item of spirits) {
      expect(item.detail, item.name).toMatch(/^5 cl\b/);
      expect(item.detailEn, item.name).toMatch(/^5 cl\b/);
    }
    // Sıcak içecek ve meşrubatlar listede: ölçü notu almazlar, kaynak sistemin seçenek listesi de metne girmez.
    const soft = outlet.items.filter((i) => ["SICAK İÇECEKLER", "MEŞRUBATLAR"].includes(i.catPath[0]!));
    expect(soft).toHaveLength(25);
    for (const item of soft) {
      expect(item.price, item.name).toBeGreaterThan(0);
      expect(`${item.detail ?? ""} ${item.detailEn ?? ""}`, item.name).not.toMatch(/Seçenekler|Opsiyonlar|Porsiyon|^[0-9]+ cl/);
      expect(item.nameEn, item.name).not.toMatch(/[ÇĞİÖŞÜçğıöşü]/);
    }
    // Kokteyl ve biralar ölçüyle satılmaz.
    for (const item of outlet.items.filter((i) => ["BİRALAR", "İMZA KOKTEYLLER", "ULUSLARARASI KOKTEYLLER"].includes(i.catPath[0]!))) {
      expect(item.detail ?? "", item.name).not.toMatch(/^\d+ cl\b/);
    }
  });
});
