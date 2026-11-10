import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COVER_IMAGE_PATTERN, DARK_TEMPLATE_STYLES, DESIGN_TEMPLATES, HERO_FONT_FAMILIES } from "@/modules/menu/design";
import { contrastRatio, readableText } from "@/modules/menu/contrast";
import { MENU_THEMES, type MenuThemeDef } from "../../prisma/seed/menuThemes";
import {
  BRAND_COVER_DARK_OUTLETS,
  OUTLET_DESIGN_PRESETS,
  ROOM_SERVICE_DESIGN_PRESETS,
  presetDesignRow,
  type OutletDesignPreset,
} from "../../prisma/seed/menuDesigns";
import { RENAMED_OUTLETS } from "../../prisma/seed/outlets";

const ROOT = path.resolve(__dirname, "../..");
const COVER_THEMES = new Set(["Whiskey Lounge Lacivert & Altın", "Roof Garden Kömür & Bakır", "Blue Sea Beyaz & Lacivert"]);
const COVER_MIGRATION = readFileSync(
  path.join(ROOT, "prisma/migrations/20261111010000_kapak_gorselli_menuler/migration.sql"),
  "utf8",
);
const MIGRATION = readFileSync(
  path.join(ROOT, "prisma/migrations/20261110170000_acik_menu_tasarimlari/migration.sql"),
  "utf8",
);
const FONTS_CSS = readFileSync(path.join(ROOT, "src/app/(guest)/fonts.css"), "utf8");

const PRESETS: [string, OutletDesignPreset][] = [
  ...Object.entries(OUTLET_DESIGN_PRESETS),
  ...Object.entries(ROOM_SERVICE_DESIGN_PRESETS).map(([code, p]) => [`Oda Servisi ${code}`, p] as [string, OutletDesignPreset]),
];

function channels(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 black .. 1 white). */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `color-mix(in srgb, fg p, transparent)` painted over `bg`: the colour the guest actually sees. */
function over(fg: string, alpha: number, bg: string): string {
  const a = channels(fg);
  const b = channels(bg);
  return `#${a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

const theme = (name: string): MenuThemeDef => {
  const found = MENU_THEMES.find((t) => t.name === name);
  if (!found) throw new Error(`tema yok: ${name}`);
  return found;
};

/** The pairs guest.css paints from one theme (body text, muted text at 62%, accent text, button text). */
function contrastPairs(t: MenuThemeDef) {
  const text = readableText(t.bg);
  return {
    "metin/zemin": contrastRatio(text, t.bg),
    "metin/kart": contrastRatio(text, t.soft),
    "vurgu-üstü-metin/vurgu": contrastRatio(t.textOnAccent, t.accent),
    "vurgu/zemin": contrastRatio(t.accent, t.bg),
    "vurgu/kart": contrastRatio(t.accent, t.soft),
    "ikincil/zemin": contrastRatio(over(text, 0.62, t.bg), t.bg),
    "ikincil/kart": contrastRatio(over(text, 0.62, t.soft), t.soft),
  };
}

describe("açık renkli outlet menüleri", () => {
  it("20 outlet preset'i var (17 outlet + 3 oda servisi)", () => {
    expect(PRESETS).toHaveLength(20);
  });

  it.each(PRESETS)("%s: zemin açık (göreli parlaklık ≥ 0.8), kart yüzeyi de açık", (name, preset) => {
    const t = theme(preset.theme);
    if (BRAND_COVER_DARK_OUTLETS.has(name)) {
      // Kapak görselinin renklerini taşıyan iki nokta bilerek koyu; zemin ile kart aynı ailede kalır.
      expect(luminance(t.bg)).toBeLessThan(0.1);
      expect(luminance(t.soft)).toBeLessThan(0.1);
      return;
    }
    expect(luminance(t.bg)).toBeGreaterThanOrEqual(0.8);
    expect(luminance(t.soft)).toBeGreaterThanOrEqual(0.7);
  });

  it.each(PRESETS)("%s: tema kontrastı WCAG AA (metin ≥ 4.5, vurgu üstü ≥ 4.5, ikincil ≥ 3)", (_name, preset) => {
    const pairs = contrastPairs(theme(preset.theme));
    expect(pairs["metin/zemin"]).toBeGreaterThanOrEqual(4.5);
    expect(pairs["metin/kart"]).toBeGreaterThanOrEqual(4.5);
    expect(pairs["vurgu-üstü-metin/vurgu"]).toBeGreaterThanOrEqual(4.5);
    // Prices, category headings and the hero title are written in the accent colour.
    expect(pairs["vurgu/zemin"]).toBeGreaterThanOrEqual(4.5);
    expect(pairs["vurgu/kart"]).toBeGreaterThanOrEqual(4.5);
    expect(pairs["ikincil/zemin"]).toBeGreaterThanOrEqual(3);
    expect(pairs["ikincil/kart"]).toBeGreaterThanOrEqual(3);
  });

  it.each(PRESETS)("%s: şablon katalogda ve koyu zemine dayanan bir stil değil", (name, preset) => {
    const template = DESIGN_TEMPLATES.find((t) => t.id === preset.template);
    expect(template).toBeDefined();
    if (BRAND_COVER_DARK_OUTLETS.has(name)) return;
    expect(DARK_TEMPLATE_STYLES.has(template!.style)).toBe(false);
  });

  it.each(PRESETS)("%s: hero renkleri temadan gelir, hero fontu yerel fonts.css ailesidir", (_name, preset) => {
    const { options } = presetDesignRow(preset);
    expect(options.heroBgColor ?? "").toBe("");
    expect(options.heroTextColor ?? "").toBe("");
    const font = HERO_FONT_FAMILIES.find((f) => f.id === options.heroFontFamily);
    expect(font).toBeDefined();
    if (font!.id !== "serif" && font!.id !== "sans") {
      const family = font!.font.split(",")[0].replace(/'/g, "").trim();
      expect(FONTS_CSS).toContain(`font-family: "${family}"`);
    }
  });

  it("kapak görselli noktalar: görsel dosyası yerinde, tema zemini kapağın kenar rengiyle aynı aile", () => {
    const covers = PRESETS.filter(([, p]) => p.options?.hero === "COVER");
    expect(covers.map(([n]) => n).sort()).toEqual(["Blue Sea Beach Bar", "The Roof Garden", "Whiskey Lounge"]);
    for (const [, p] of covers) {
      const url = p.options!.heroImageUrl!;
      expect(COVER_IMAGE_PATTERN.test(url)).toBe(true);
      expect(existsSync(path.join(ROOT, "public", url))).toBe(true);
    }
  });

  it("outlet'ler ayırt edilebilir: aynı şablon + tema ikilisi iki outlet'te yok", () => {
    const pairs = PRESETS.map(([, p]) => `${p.template}|${p.theme}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("varsayılan tema tek ve açık; koyu katalog temaları silinmedi", () => {
    const defaults = MENU_THEMES.filter((t) => t.isDefault);
    expect(defaults.map((t) => t.name)).toEqual(["Fildişi & Altın Zarafet"]);
    expect(luminance(defaults[0].bg)).toBeGreaterThanOrEqual(0.8);
    for (const dark of ["Royal Gold", "Bordo & Venedik", "Safir Gece", "Aman Zen Slate"]) {
      expect(MENU_THEMES.some((t) => t.name === dark)).toBe(true);
    }
    expect(DESIGN_TEMPLATES.some((t) => t.id === "NOIR_LOUNGE")).toBe(true);
  });

  it("katalogdaki her açık tema (zemin ≥ 0.8) de aynı kontrast eşiğini geçer", () => {
    for (const t of MENU_THEMES.filter((x) => luminance(x.bg) >= 0.8)) {
      const pairs = contrastPairs(t);
      expect(pairs["metin/zemin"], t.name).toBeGreaterThanOrEqual(4.5);
      expect(pairs["vurgu-üstü-metin/vurgu"], t.name).toBeGreaterThanOrEqual(4.5);
      expect(pairs["ikincil/zemin"], t.name).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("migration 20261110170000_acik_menu_tasarimlari", () => {
  it.each(PRESETS)("%s: tasarım satırı ve tema migration'da preset ile aynı", (_name, preset) => {
    const row = presetDesignRow(preset);
    const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;
    if (row.options.hero === "COVER") {
      // Kapak görselli üç nokta 20261111010000 ile yeniden yazıldı; satır o migration'da birebir durur.
      expect(COVER_MIGRATION).toContain(sqlText(JSON.stringify(row.options)));
      expect(COVER_MIGRATION).toContain(`${sqlText(row.template)}, ${sqlText(JSON.stringify(row.layout))}`);
      expect(COVER_MIGRATION).toContain(sqlText(preset.theme));
      return;
    }
    // 170000 yazıldığında süzgeçler açıktı ve showFeatured seçeneği yoktu; ikisini 20261110200000 kapatır.
    const { showFeatured, logoUrl, introSplash, priceLists, ...rest } = row.options;
    expect(priceLists).toBe(true); // fiyat listesi seçeneği sonradan eklendi, migration metninde yok
    expect(introSplash).toBe(true); // animasyonlu açılış 20261111020000 ile her menüde açıldı
    expect(logoUrl).toBe(""); // logo seçeneği sonradan eklendi, migration metninde yok
    expect(showFeatured).toBe(false);
    expect(row.options.showFilters).toBe(false);
    expect(MIGRATION).toContain(sqlText(JSON.stringify({ ...rest, showFilters: true })));
    expect(MIGRATION).toContain(`${sqlText(row.template)}, ${sqlText(JSON.stringify(row.layout))}`);
    expect(MIGRATION).toContain(sqlText(preset.theme));
  });

  it("her outlet adı otel koduyla eşleşir; oda servisi tür ile", () => {
    // Migration yazıldıktan sonra outlet'ler otelin kendi adlarını aldı; migration metni o günkü adı taşır.
    const nameThen = new Map<string, string>([
      ...RENAMED_OUTLETS.map((r) => [r.to, r.from] as [string, string]),
      ["The Roof Garden", "Shisha & Sunset Terrace"],
    ]);
    for (const current of Object.keys(OUTLET_DESIGN_PRESETS)) {
      const name = nameThen.get(current) ?? current;
      expect(MIGRATION).toMatch(new RegExp(`\\('(DIAMOND|ROYAL|PREMIUM)', '${name.replace(/[&()]/g, "\\$&")}'`));
    }
    for (const code of Object.keys(ROOM_SERVICE_DESIGN_PRESETS)) {
      expect(MIGRATION).toContain(`('${code}', NULL,`);
    }
    expect(MIGRATION).toContain(`o."type" = 'ODA_SERVISI'`);
  });

  it("eksik temaları ekler (var olanı ezmez) ve varsayılanı açık temaya çevirir", () => {
    const used = new Set(PRESETS.map(([, p]) => p.theme));
    for (const name of used) {
      const t = theme(name);
      expect(COVER_THEMES.has(name) ? COVER_MIGRATION : MIGRATION).toContain(`('${name}', '${t.bg}', '${t.accent}', '${t.soft}', '${t.textOnAccent}')`);
    }
    expect(MIGRATION).toContain(`ON CONFLICT ("name") DO NOTHING`);
    expect(MIGRATION).toContain(`SET "is_default" = ("name" = 'Fildişi & Altın Zarafet')`);
    expect(MIGRATION).toContain(`ON CONFLICT ("outlet_id") DO UPDATE`);
  });
});
