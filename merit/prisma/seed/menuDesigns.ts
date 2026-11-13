import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_HOTEL_CODES } from "./hotels";
import { templatePreset, type DesignBlockId, type DesignOptions, type TemplateId } from "@/modules/menu/design";

export interface OutletDesignPreset {
  ambience: string;
  concept: string;
  template: TemplateId;
  theme: string;
  showPrices?: boolean;
  /** Per-outlet touches on top of the template (tab style, hero alignment, hero font from fonts.css). */
  options?: Partial<DesignOptions>;
}

/**
 * Outlets whose design follows their printed menu cover (ürün sahibi kararı, 11 Kas 2026): the cover is the hero
 * and the page takes the cover's own colours, so these two are dark on purpose.
 */
export const BRAND_COVER_DARK_OUTLETS: ReadonlySet<string> = new Set(["Whiskey Lounge", "The Roof Garden"]);

/**
 * Outlets without a printed menu cover get a generated one (14 Kas 2026): hotel logo, outlet name and a line motif
 * in the outlet's own theme colours and hero font (scripts/generate-menu-covers.ts). Keyed by outlet name, or by
 * `ODA_SERVISI:<hotel code>` for the room service menus. The page design itself is untouched: only the welcome
 * area shows the cover. Existing installs get them through migration 20261114010000_uretilen_menu_kapaklari.
 */
export const GENERATED_COVERS: Readonly<Record<string, string>> = {
  "ODA_SERVISI:DIAMOND": "/merit-menus/kapak-oda-servisi-diamond.jpg",
  "ODA_SERVISI:ROYAL": "/merit-menus/kapak-oda-servisi-royal.jpg",
  "ODA_SERVISI:PREMIUM": "/merit-menus/kapak-oda-servisi-premium.jpg",
  "Diamond Lobby Bar": "/merit-menus/kapak-diamond-lobby-bar.jpg",
  "Royal Lobby Bar": "/merit-menus/kapak-royal-lobby-bar.jpg",
  "Premium Lobby Bar": "/merit-menus/kapak-premium-lobby-bar.jpg",
  "Diamond Pool Bar": "/merit-menus/kapak-diamond-pool-bar.jpg",
  "Premium Pool Bar": "/merit-menus/kapak-premium-pool-bar.jpg",
  "Tea Lounge": "/merit-menus/kapak-tea-lounge.jpg",
  "Cafe Verde": "/merit-menus/kapak-cafe-verde.jpg",
  "The Steakhouse": "/merit-menus/kapak-the-steakhouse.jpg",
  "Royal Mandarin": "/merit-menus/kapak-royal-mandarin.jpg",
  "Bella Merit": "/merit-menus/kapak-bella-merit.jpg",
};

/*
 * Every other Merit outlet opens on a light page (Kasım 2026 kararı). One family: ivory/cream paper, dark readable text,
 * a single deep accent per concept. Concepts that used to be dark (whisky, wine, shisha, steak, Far East) keep their
 * mood in the accent and typography, not in the background.
 */
export const ROOM_SERVICE_DESIGN_PRESETS: Record<string, OutletDesignPreset> = {
  DIAMOND: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Four Seasons Fildişi",
    showPrices: true,
    options: { categoryTabStyle: "SEGMENT_CARDS", heroAlign: "center", heroFontFamily: "cinzel" },
  },
  ROYAL: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Fildişi & Altın Zarafet",
    showPrices: true,
    options: { categoryTabStyle: "SEGMENT_CARDS", heroAlign: "center", heroFontFamily: "cinzel" },
  },
  PREMIUM: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Şampanya & Kaşmir",
    showPrices: true,
    options: { categoryTabStyle: "SEGMENT_CARDS", heroAlign: "center", heroFontFamily: "cinzel" },
  },
};

export const OUTLET_DESIGN_PRESETS: Record<string, OutletDesignPreset> = {
  // DIAMOND Outlets
  "Diamond Lobby Bar": {
    ambience: "LOUNGE",
    concept: "ART_DECO",
    template: "CRYSTAL_BAR",
    theme: "Four Seasons Fildişi",
    showPrices: false,
    options: { categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "cormorant", heroFontSize: "large" },
  },
  "Diamond Pool Bar": {
    ambience: "POOL",
    concept: "DAYLIGHT",
    template: "SUNLIGHT_POOL",
    theme: "Ege İncisi & Mercan",
    showPrices: false,
    options: { categoryTabStyle: "CHIPS_ROW", heroFontFamily: "montserrat" },
  },
  "Tea Lounge": {
    ambience: "CAFE",
    concept: "PASTEL",
    template: "ROSE_PATISSERIE",
    theme: "Pudra & Gül Bahçesi",
    showPrices: false,
    options: { categoryTabStyle: "GRID_PILLS", heroAlign: "center", heroFontFamily: "greatvibes" },
  },
  "Whiskey Lounge": {
    ambience: "LOUNGE",
    concept: "CLASSIC",
    template: "COGNAC_LIBRARY",
    theme: "Whiskey Lounge Lacivert & Altın",
    showPrices: true,
    options: { hero: "COVER", heroImageUrl: "/merit-menus/kapak-whiskey-lounge.jpg" },
  },
  "The Roof Garden": {
    ambience: "LOUNGE",
    concept: "CONTEMPORARY",
    template: "SPEAKEASY_BAR",
    theme: "Roof Garden Kömür & Bakır",
    showPrices: true,
    options: { hero: "COVER", heroImageUrl: "/merit-menus/kapak-roof-garden.jpg" },
  },
  "The Steakhouse": {
    ambience: "GOURMET",
    concept: "RUSTIC",
    template: "CHEF_TABLE",
    theme: "Keten & Kömür",
    showPrices: true,
    options: { categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "playfair" },
  },

  // ROYAL Outlets
  "Royal Lobby Bar": {
    ambience: "LOUNGE",
    concept: "DAYLIGHT",
    template: "DAYLIGHT_LOUNGE",
    theme: "Porselen & Safir",
    showPrices: false,
    options: { categoryTabStyle: "CHIPS_ROW", heroFontFamily: "playfair" },
  },
  "Royal Sea View Pool Bar": {
    ambience: "SUNDECK",
    concept: "DAYLIGHT",
    template: "SANTORINI_TERRACE",
    theme: "Akdeniz Beyazı & Turkuaz",
    showPrices: false,
    options: { categoryTabStyle: "CHIPS_ROW", heroFontFamily: "jakarta" },
  },
  "Blue Sea Beach Bar": {
    ambience: "SUNDECK",
    concept: "RIVIERA",
    template: "WHITE_RIVIERA",
    theme: "Blue Sea Beyaz & Lacivert",
    showPrices: false,
    options: { heroFontFamily: "montserrat", hero: "COVER", heroImageUrl: "/merit-menus/kapak-blue-sea.jpg" },
  },
  "Dionysos Wine House": {
    ambience: "GOURMET",
    concept: "CLASSIC",
    template: "SOMMELIER_CELLAR",
    theme: "Mahzen Krem & Bordo",
    showPrices: true,
    options: { categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "cormorant", heroFontSize: "large" },
  },
  "Vienna Cafe": {
    ambience: "CAFE",
    concept: "CLASSIC",
    template: "VIENNA_HERITAGE",
    theme: "Krem",
    showPrices: false,
    options: { categoryTabStyle: "GRID_PILLS", heroAlign: "center", heroFontFamily: "playfair" },
  },
  "Blue Sea Alakart": {
    ambience: "SEAFOOD",
    concept: "RIVIERA",
    template: "AEGEAN_MARINA",
    theme: "Santorini Mavi & Beyaz",
    showPrices: true,
    options: { categoryTabStyle: "CHIPS_ROW", heroFontFamily: "marcellus" },
  },
  "Royal Mandarin": {
    ambience: "GOURMET",
    concept: "MINIMALIST",
    template: "ZEN_ASIAN",
    theme: "Porselen & Lake Kırmızı",
    showPrices: true,
    options: { categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "cinzel" },
  },
  "Bella Merit": {
    ambience: "GOURMET",
    concept: "MEDITERRANEAN",
    template: "LUMIERE_DINING",
    theme: "Toskana Krem & Zeytin",
    showPrices: true,
    options: { categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "bodoni" },
  },

  // PREMIUM Outlets
  "Premium Lobby Bar": {
    ambience: "LOUNGE",
    concept: "DAYLIGHT",
    template: "DAYLIGHT_LOUNGE",
    theme: "Şampanya & Kaşmir",
    showPrices: false,
    options: { categoryTabStyle: "CHIPS_ROW", heroAlign: "center", heroFontFamily: "cormorant" },
  },
  "Premium Pool Bar": {
    ambience: "POOL",
    concept: "DAYLIGHT",
    template: "SUNLIGHT_POOL",
    theme: "Narenciye & Güneş",
    showPrices: false,
    options: { categoryTabStyle: "CHIPS_ROW", heroFontFamily: "jakarta" },
  },
  "Cafe Verde": {
    ambience: "PATIO",
    concept: "DAYLIGHT",
    template: "SUNLIT_VERANDA",
    theme: "Adaçayı & Botanik",
    showPrices: false,
    options: { categoryTabStyle: "GRID_PILLS", heroFontFamily: "playfair" },
  },
};

/** The stored design row a preset produces (template options + the outlet's own touches). */
export function presetDesignRow(preset: OutletDesignPreset): {
  ambience: string;
  concept: string;
  template: TemplateId;
  layout: DesignBlockId[];
  options: DesignOptions;
} {
  const base = templatePreset(preset.template);
  return {
    ambience: preset.ambience,
    concept: preset.concept,
    template: preset.template,
    layout: base.layout,
    options: {
      ...base.options,
      showImages: true,
      showAllergens: true,
      showTags: true,
      showPrices: preset.showPrices ?? false,
      showSearch: true,
      showFilters: false,
      showFeatured: false,
      ...preset.options,
    },
  };
}

const LEGACY_PRESET_TEMPLATES = new Set<string>([
  "ROYAL",
  "SUNSET_CABANA",
  "COASTAL",
  "AQUA_GOLD",
  "POOL_CLUB",
  "PATISSERIE",
  "CHEF_TABLE",
  "VELVET",
  "CRYSTAL_BAR",
  "ATRIUM_SOCIAL",
  "BOTANICAL_BISTRO",
  "MIDNIGHT_ROOF",
]);

async function applyOutletPreset(
  db: PrismaClient,
  outlet: { id: string; themeId: string | null; menuDesign: { id: string; template: string } | null },
  preset: OutletDesignPreset,
  themes: Map<string, string>,
  forceDefault: boolean,
  cover?: string,
): Promise<void> {
  // A design that already is this outlet's preset template is the operator's own (possibly edited) copy.
  const isLegacyPreset = Boolean(
    outlet.menuDesign &&
      outlet.menuDesign.template !== preset.template &&
      LEGACY_PRESET_TEMPLATES.has(outlet.menuDesign.template),
  );
  if (!outlet.menuDesign || isLegacyPreset || forceDefault) {
    const row = presetDesignRow(preset);
    const data = {
      ambience: row.ambience,
      concept: row.concept,
      template: row.template,
      layout: row.layout as never,
      options: (cover ? { ...row.options, hero: "COVER", heroImageUrl: cover } : row.options) as never,
    };
    await db.outletMenuDesign.upsert({
      where: { outletId: outlet.id },
      create: { outletId: outlet.id, ...data },
      update: data,
    });
  }
  if ((!outlet.themeId || isLegacyPreset || forceDefault) && themes.has(preset.theme)) {
    await db.outlet.update({ where: { id: outlet.id }, data: { themeId: themes.get(preset.theme)! } });
  }
}

/**
 * Seeds and persists the concept-matched default Ambiance, Concept, Template, and Theme for all 20 Merit outlets.
 * Existing installs move to these designs through migration 20261110170000_acik_menu_tasarimlari.
 */
export async function seedOutletMenuDesigns(db: PrismaClient, forceDefault = false): Promise<void> {
  const themes = new Map(
    (await db.menuTheme.findMany({ select: { id: true, name: true } })).map((theme) => [theme.name, theme.id]),
  );

  // 1. Named F&B Outlets (17)
  for (const [name, preset] of Object.entries(OUTLET_DESIGN_PRESETS)) {
    const outlets = await db.outlet.findMany({
      where: { name, hasMenu: true, isActive: true, hotel: { code: { in: DEMO_HOTEL_CODES } } },
      select: { id: true, themeId: true, menuDesign: { select: { id: true, template: true } } },
    });
    for (const outlet of outlets) {
      await applyOutletPreset(db, outlet, preset, themes, forceDefault, GENERATED_COVERS[name]);
    }
  }

  // 2. Room Service Outlets (3 - DIAMOND, ROYAL, PREMIUM)
  for (const hotelCode of DEMO_HOTEL_CODES) {
    const preset = ROOM_SERVICE_DESIGN_PRESETS[hotelCode];
    if (!preset) continue;
    const rsOutlets = await db.outlet.findMany({
      where: { type: "ODA_SERVISI", hasMenu: true, isActive: true, hotel: { code: hotelCode } },
      select: { id: true, themeId: true, menuDesign: { select: { id: true, template: true } } },
    });
    for (const outlet of rsOutlets) {
      await applyOutletPreset(db, outlet, preset, themes, forceDefault, GENERATED_COVERS[`ODA_SERVISI:${hotelCode}`]);
    }
  }
}
