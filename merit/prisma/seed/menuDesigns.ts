import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_HOTEL_CODES } from "./hotels";
import { templatePreset, type TemplateId } from "@/modules/menu/design";

const PRESETS: Record<string, { ambience: string; concept: string; template: TemplateId; theme: string }> = {
  "Beach Bar": { ambience: "SUNDECK", concept: "RIVIERA", template: "WHITE_RIVIERA", theme: "Sahil Kumu & Mercan" },
  "Captain’s Lounge Bar": { ambience: "LOUNGE", concept: "DAYLIGHT", template: "DAYLIGHT_LOUNGE", theme: "Porselen & Safir" },
  "Dionysos Wine House": { ambience: "GOURMET", concept: "CLASSIC", template: "SOMMELIER_CELLAR", theme: "Bordo & Venedik" },
  "Havuz Bar": { ambience: "POOL", concept: "DAYLIGHT", template: "SUNLIGHT_POOL", theme: "Akdeniz Beyazı & Turkuaz" },
  "Royal Sea View Pool Bar": { ambience: "SUNDECK", concept: "DAYLIGHT", template: "SANTORINI_TERRACE", theme: "Akdeniz Beyazı & Turkuaz" },
  "Vienna Cafe": { ambience: "BRUNCH", concept: "PASTEL", template: "PASTEL_BOULANGERIE", theme: "Şampanya & Kaşmir" },
  "Blue Sea Alakart": { ambience: "SEAFOOD", concept: "RIVIERA", template: "AEGEAN_MARINA", theme: "Santorini Mavi & Beyaz" },
  "Royal Mandarin": { ambience: "GOURMET", concept: "MINIMALIST", template: "ZEN_ASIAN", theme: "Aman Zen Slate" },
  "Bella Merit": { ambience: "GOURMET", concept: "DAYLIGHT", template: "LUMIERE_DINING", theme: "Fildişi & Altın Zarafet" },
  "Diamond 24/7 Lobby Lounge": { ambience: "LOUNGE", concept: "DAYLIGHT", template: "DAYLIGHT_LOUNGE", theme: "Four Seasons Fildişi" },
  "Diamond Exclusive Whiskey House": { ambience: "LOUNGE", concept: "CLASSIC", template: "NOIR_LOUNGE", theme: "Bordo & Venedik" },
  "Diamond Lagoon Pool Bar & Deck": { ambience: "POOL", concept: "DAYLIGHT", template: "SUNLIGHT_POOL", theme: "Santorini Mavi & Beyaz" },
  "Diamond Royal Tea & Patisserie": { ambience: "CAFE", concept: "PASTEL", template: "ROSE_PATISSERIE", theme: "Pudra & Gül Bahçesi" },
  "Shisha & Sunset Terrace": { ambience: "ROOFTOP", concept: "LUXURY", template: "MIDNIGHT_ROOF", theme: "Safir Gece" },
  "The Steakhouse": { ambience: "RESORT", concept: "RUSTIC", template: "ARTISAN_GRILL", theme: "Bordo & Venedik" },
  "Premium Lagoon & Kids Pool Bar": { ambience: "POOL", concept: "DAYLIGHT", template: "SUNLIGHT_POOL", theme: "Narenciye & Güneş" },
  "Premium Lobby & Atrium Bar": { ambience: "LOUNGE", concept: "DAYLIGHT", template: "DAYLIGHT_LOUNGE", theme: "Şampanya & Kaşmir" },
  "Merit Premium Cafe Verde": { ambience: "PATIO", concept: "DAYLIGHT", template: "SUNLIT_VERANDA", theme: "Adaçayı & Botanik" },
};

const LEGACY_PRESET_TEMPLATES = new Set<string>([
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
]);

/** DEMO (SEED_DEMO=true): seed a concept-matched starting design for demo outlets, preserving any operator edits. */
export async function seedOutletMenuDesigns(db: PrismaClient): Promise<void> {
  const themes = new Map((await db.menuTheme.findMany({ select: { id: true, name: true } })).map((theme) => [theme.name, theme.id]));
  for (const [name, preset] of Object.entries(PRESETS)) {
    const outlets = await db.outlet.findMany({
      where: { name, hasMenu: true, isActive: true, hotel: { code: { in: DEMO_HOTEL_CODES } } },
      select: { id: true, themeId: true, menuDesign: { select: { id: true, template: true } } },
    });
    for (const outlet of outlets) {
      const isLegacyPreset = outlet.menuDesign && LEGACY_PRESET_TEMPLATES.has(outlet.menuDesign.template);
      if (!outlet.menuDesign || isLegacyPreset) {
        const base = templatePreset(preset.template);
        await db.outletMenuDesign.upsert({
          where: { outletId: outlet.id },
          create: {
            outletId: outlet.id,
            ambience: preset.ambience,
            concept: preset.concept,
            template: preset.template,
            layout: base.layout as never,
            options: { ...base.options, showPrices: false } as never,
          },
          update: {
            ambience: preset.ambience,
            concept: preset.concept,
            template: preset.template,
            layout: base.layout as never,
            options: { ...base.options, showPrices: false } as never,
          },
        });
      }
      if ((!outlet.themeId || isLegacyPreset) && themes.has(preset.theme)) {
        await db.outlet.update({ where: { id: outlet.id }, data: { themeId: themes.get(preset.theme)! } });
      }
    }
  }
}
