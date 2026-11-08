import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_HOTEL_CODES } from "./hotels";
import { templatePreset, type TemplateId } from "@/modules/menu/design";

export interface OutletDesignPreset {
  ambience: string;
  concept: string;
  template: TemplateId;
  theme: string;
  showPrices?: boolean;
}

export const ROOM_SERVICE_DESIGN_PRESETS: Record<"DIAMOND" | "ROYAL" | "PREMIUM", OutletDesignPreset> = {
  DIAMOND: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Four Seasons Fildişi",
    showPrices: true,
  },
  ROYAL: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Fildişi & Altın Zarafet",
    showPrices: true,
  },
  PREMIUM: {
    ambience: "RESORT",
    concept: "DAYLIGHT",
    template: "IVORY_PALACE",
    theme: "Şampanya & Kaşmir",
    showPrices: true,
  },
};

export const OUTLET_DESIGN_PRESETS: Record<string, OutletDesignPreset> = {
  // DIAMOND Outlets
  "Diamond 24/7 Lobby Lounge": {
    ambience: "LOUNGE",
    concept: "DAYLIGHT",
    template: "DAYLIGHT_LOUNGE",
    theme: "Four Seasons Fildişi",
    showPrices: false,
  },
  "Diamond Lagoon Pool Bar & Deck": {
    ambience: "POOL",
    concept: "DAYLIGHT",
    template: "SUNLIGHT_POOL",
    theme: "Santorini Mavi & Beyaz",
    showPrices: false,
  },
  "Diamond Royal Tea & Patisserie": {
    ambience: "CAFE",
    concept: "PASTEL",
    template: "ROSE_PATISSERIE",
    theme: "Pudra & Gül Bahçesi",
    showPrices: false,
  },
  "Diamond Exclusive Whiskey House": {
    ambience: "LOUNGE",
    concept: "CLASSIC",
    template: "NOIR_LOUNGE",
    theme: "Bordo & Venedik",
    showPrices: true,
  },
  "Shisha & Sunset Terrace": {
    ambience: "ROOFTOP",
    concept: "BOHEMIAN",
    template: "SUNSET_SKY_TERRACE",
    theme: "Safir Gece",
    showPrices: true,
  },
  "The Steakhouse": {
    ambience: "RESORT",
    concept: "RUSTIC",
    template: "ARTISAN_GRILL",
    theme: "Bordo & Venedik",
    showPrices: true,
  },

  // ROYAL Outlets
  "Captain’s Lounge Bar": {
    ambience: "LOUNGE",
    concept: "DAYLIGHT",
    template: "DAYLIGHT_LOUNGE",
    theme: "Porselen & Safir",
    showPrices: false,
  },
  "Royal Sea View Pool Bar": {
    ambience: "SUNDECK",
    concept: "DAYLIGHT",
    template: "SANTORINI_TERRACE",
    theme: "Akdeniz Beyazı & Turkuaz",
    showPrices: false,
  },
  "Beach Bar": {
    ambience: "SUNDECK",
    concept: "RIVIERA",
    template: "WHITE_RIVIERA",
    theme: "Sahil Kumu & Mercan",
    showPrices: false,
  },
  "Dionysos Wine House": {
    ambience: "GOURMET",
    concept: "CLASSIC",
    template: "SOMMELIER_CELLAR",
    theme: "Bordo & Venedik",
    showPrices: true,
  },
  "Vienna Cafe": {
    ambience: "BRUNCH",
    concept: "PASTEL",
    template: "PASTEL_BOULANGERIE",
    theme: "Şampanya & Kaşmir",
    showPrices: false,
  },
  "Blue Sea Alakart": {
    ambience: "SEAFOOD",
    concept: "RIVIERA",
    template: "AEGEAN_MARINA",
    theme: "Santorini Mavi & Beyaz",
    showPrices: true,
  },
  "Royal Mandarin": {
    ambience: "GOURMET",
    concept: "MINIMALIST",
    template: "ZEN_ASIAN",
    theme: "Aman Zen Slate",
    showPrices: true,
  },
  "Bella Merit": {
    ambience: "GOURMET",
    concept: "DAYLIGHT",
    template: "LUMIERE_DINING",
    theme: "Fildişi & Altın Zarafet",
    showPrices: true,
  },

  // PREMIUM Outlets
  "Premium Lobby & Atrium Bar": {
    ambience: "LOUNGE",
    concept: "DAYLIGHT",
    template: "DAYLIGHT_LOUNGE",
    theme: "Şampanya & Kaşmir",
    showPrices: false,
  },
  "Premium Lagoon & Kids Pool Bar": {
    ambience: "POOL",
    concept: "DAYLIGHT",
    template: "SUNLIGHT_POOL",
    theme: "Narenciye & Güneş",
    showPrices: false,
  },
  "Merit Premium Cafe Verde": {
    ambience: "PATIO",
    concept: "DAYLIGHT",
    template: "SUNLIT_VERANDA",
    theme: "Adaçayı & Botanik",
    showPrices: false,
  },
};

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
): Promise<void> {
  const isLegacyPreset = Boolean(outlet.menuDesign && LEGACY_PRESET_TEMPLATES.has(outlet.menuDesign.template));
  if (!outlet.menuDesign || isLegacyPreset || forceDefault) {
    const base = templatePreset(preset.template);
    const optionsPayload = {
      ...base.options,
      showImages: true,
      showAllergens: true,
      showTags: true,
      showPrices: preset.showPrices ?? false,
      showSearch: true,
      showFilters: true,
    };
    await db.outletMenuDesign.upsert({
      where: { outletId: outlet.id },
      create: {
        outletId: outlet.id,
        ambience: preset.ambience,
        concept: preset.concept,
        template: preset.template,
        layout: base.layout as never,
        options: optionsPayload as never,
      },
      update: {
        ambience: preset.ambience,
        concept: preset.concept,
        template: preset.template,
        layout: base.layout as never,
        options: optionsPayload as never,
      },
    });
  }
  if ((!outlet.themeId || isLegacyPreset || forceDefault) && themes.has(preset.theme)) {
    await db.outlet.update({ where: { id: outlet.id }, data: { themeId: themes.get(preset.theme)! } });
  }
}

/**
 * Seeds and persists the concept-matched default Ambiance, Concept, Template, and Theme for all 20 Merit outlets.
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
      await applyOutletPreset(db, outlet, preset, themes, forceDefault);
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
      await applyOutletPreset(db, outlet, preset, themes, forceDefault);
    }
  }
}
