import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_HOTEL_CODES } from "./hotels";
import { templatePreset, type TemplateId } from "@/modules/menu/design";

const PRESETS: Record<string, { ambience: string; concept: string; template: TemplateId; theme: string }> = {
  "Beach Bar": { ambience: "CABANA", concept: "BOHEMIAN", template: "SUNSET_CABANA", theme: "Terracotta & Kumsal" },
  "Captain’s Lounge Bar": { ambience: "BEACH", concept: "MEDITERRANEAN", template: "COASTAL", theme: "Deniz" },
  "Dionysos Wine House": { ambience: "GOURMET", concept: "CLASSIC", template: "SOMMELIER_CELLAR", theme: "Bordo & Venedik" },
  "Havuz Bar": { ambience: "POOL", concept: "LUXURY", template: "AQUA_GOLD", theme: "Deniz" },
  "Royal Sea View Pool Bar": { ambience: "POOL", concept: "CONTEMPORARY", template: "POOL_CLUB", theme: "Deniz" },
  "Vienna Cafe": { ambience: "CAFE", concept: "CLASSIC", template: "PATISSERIE", theme: "Krem" },
  "Blue Sea Alakart": { ambience: "BEACH", concept: "MEDITERRANEAN", template: "COASTAL", theme: "Caviar & Deniz İncisi" },
  "Royal Mandarin": { ambience: "GOURMET", concept: "MINIMALIST", template: "ZEN_ASIAN", theme: "Aman Zen Slate" },
  "Bella Merit": { ambience: "GOURMET", concept: "LUXURY", template: "CHEF_TABLE", theme: "Capri Limoncello" },
  "Diamond 24/7 Lobby Lounge": { ambience: "LOUNGE", concept: "LUXURY", template: "VELVET", theme: "Koyu Lüks" },
  "Diamond Exclusive Whiskey House": { ambience: "LOUNGE", concept: "CLASSIC", template: "NOIR_LOUNGE", theme: "Bordo & Venedik" },
  "Diamond Lagoon Pool Bar & Deck": { ambience: "POOL", concept: "LUXURY", template: "AQUA_GOLD", theme: "Deniz" },
  "Diamond Royal Tea & Patisserie": { ambience: "CAFE", concept: "ART_DECO", template: "CRYSTAL_BAR", theme: "Gül Kurusu & Şampanya" },
  "Shisha & Sunset Terrace": { ambience: "ROOFTOP", concept: "LUXURY", template: "MIDNIGHT_ROOF", theme: "Safir Gece" },
  "The Steakhouse": { ambience: "RESORT", concept: "RUSTIC", template: "ARTISAN_GRILL", theme: "Bordo & Venedik" },
  "Premium Lagoon & Kids Pool Bar": { ambience: "POOL", concept: "CONTEMPORARY", template: "POOL_CLUB", theme: "Deniz" },
  "Premium Lobby & Atrium Bar": { ambience: "LOUNGE", concept: "LUXURY", template: "ATRIUM_SOCIAL", theme: "Zümrüt & Altın" },
  "Merit Premium Cafe Verde": { ambience: "PATIO", concept: "NATURAL", template: "BOTANICAL_BISTRO", theme: "Zeytin" },
};

/** DEMO (SEED_DEMO=true): seed a concept-matched starting design for demo outlets, preserving any operator edits. */
export async function seedOutletMenuDesigns(db: PrismaClient): Promise<void> {
  const themes = new Map((await db.menuTheme.findMany({ select: { id: true, name: true } })).map((theme) => [theme.name, theme.id]));
  for (const [name, preset] of Object.entries(PRESETS)) {
    const outlets = await db.outlet.findMany({ where: { name, hasMenu: true, isActive: true, hotel: { code: { in: DEMO_HOTEL_CODES } } }, select: { id: true, themeId: true, menuDesign: { select: { id: true } } } });
    for (const outlet of outlets) {
      if (!outlet.menuDesign) {
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
          update: {},
        });
      }
      if (!outlet.themeId && themes.has(preset.theme)) {
        await db.outlet.update({ where: { id: outlet.id }, data: { themeId: themes.get(preset.theme)! } });
      }
    }
  }
}
