export const AMBIENCES = [
  { id: "RESORT", label: "Otel & Resort" },
  { id: "BEACH", label: "Sahil & Beach Club" },
  { id: "POOL", label: "Havuz" },
  { id: "LOUNGE", label: "Lounge & Bar" },
  { id: "GOURMET", label: "Fine Dining" },
  { id: "CAFE", label: "Kafe & Patisserie" },
  { id: "SPA", label: "Spa & Wellness" },
  { id: "GARDEN", label: "Aile & Bahçe" },
  { id: "SPORT", label: "Spor & Aktivite" },
  { id: "ROOFTOP", label: "Teras & Sky Bar" },
  { id: "NIGHTCLUB", label: "Gece Kulübü & Canlı Müzik" },
  { id: "CABANA", label: "Özel Kabana & VIP Loca" },
  { id: "PATIO", label: "Avlu & Kış Bahçesi" },
  { id: "SUNDECK", label: "Güneşlenme Terası & Sundeck" },
  { id: "BRUNCH", label: "Sabah Kahvaltısı & Brunch" },
  { id: "SEAFOOD", label: "Deniz Ürünleri & Marina" },
] as const;

export const CONCEPTS = [
  { id: "LUXURY", label: "Modern lüks" },
  { id: "CLASSIC", label: "Klasik zarafet" },
  { id: "MEDITERRANEAN", label: "Akdeniz" },
  { id: "NATURAL", label: "Doğal ve sakin" },
  { id: "CONTEMPORARY", label: "Çağdaş" },
  { id: "BOHEMIAN", label: "Bohem & Ege" },
  { id: "MINIMALIST", label: "Zen & Minimalist" },
  { id: "ART_DECO", label: "Art Deco & Gatsby" },
  { id: "RUSTIC", label: "Rustik & Taş Fırın" },
  { id: "DAYLIGHT", label: "Gün Işığı & Ferah" },
  { id: "PASTEL", label: "Pastel & Pudra Zarafeti" },
  { id: "RIVIERA", label: "Beyaz Riviera & Sahil" },
  { id: "BOTANICAL", label: "Botanik & Organik" },
  { id: "NORDIC", label: "İskandinav Açık & Sade" },
] as const;

/** Dietary and merchandising marks a dish can carry. Labels for guests live in i18n under guest.tag. */
export const ITEM_TAG_IDS = ["VEGAN", "VEJETARYEN", "GLUTENSIZ", "SEFIN_SECIMI", "POPULER", "YENI", "ACILI"] as const;

export const ITEM_TAGS: { id: (typeof ITEM_TAG_IDS)[number]; label: string }[] = [
  { id: "VEGAN", label: "Vegan" },
  { id: "VEJETARYEN", label: "Vejetaryen" },
  { id: "GLUTENSIZ", label: "Glutensiz" },
  { id: "SEFIN_SECIMI", label: "Şefin seçimi" },
  { id: "POPULER", label: "En çok tercih edilen" },
  { id: "YENI", label: "Yeni" },
  { id: "ACILI", label: "Acılı" },
];

export type CardStyle = "LIST" | "CARD" | "PHOTO";

export const TYPOGRAPHIES = [
  { id: "SYSTEM", label: "Sistem (varsayılan)" },
  { id: "CLASSIC", label: "Klasik serif" },
  { id: "EDITORIAL", label: "Editoryal" },
  { id: "MODERN", label: "Modern sans" },
  { id: "HUMANIST", label: "Sıcak hümanist" },
  { id: "COASTAL", label: "Akdeniz serif" },
  { id: "SERENITY", label: "Zarif modern grotesk" },
] as const;

export const DENSITIES = [
  { id: "AIRY", label: "Ferah" },
  { id: "BALANCED", label: "Dengeli" },
  { id: "COMPACT", label: "Kompakt" },
] as const;

export const HERO_STYLES = [
  { id: "NONE", label: "Yok" },
  { id: "TITLE", label: "Başlık" },
  { id: "PHOTO", label: "Fotoğraf" },
] as const;

export type TypographyId = (typeof TYPOGRAPHIES)[number]["id"];
export type DensityId = (typeof DENSITIES)[number]["id"];
export type HeroStyle = (typeof HERO_STYLES)[number]["id"];

export const CATEGORY_TAB_STYLES = [
  { id: "CHIPS_ROW", label: "Yatay Çip Bar", desc: "Tek satır, yatay kayan lüks çip bar (Lüks Otel Standardı)" },
  { id: "UNDERLINE_TABS", label: "Minimalist Çizgi", desc: "Çerçevesiz, altı çizgili zarif sekmeler (Michelin & Fine Dining)" },
  { id: "SEGMENT_CARDS", label: "Kompakt Kartlar", desc: "12px modern köşeli 2 sütunlu kartlar" },
  { id: "GRID_PILLS", label: "Klasik Kapsül", desc: "2 sütunlu oval kapsül ızgara" },
] as const;

export type CategoryTabStyle = (typeof CATEGORY_TAB_STYLES)[number]["id"];
const CATEGORY_TAB_STYLE_IDS = new Set<string>(CATEGORY_TAB_STYLES.map((item) => item.id));

export type HeroAlign = "left" | "center" | "right";
export type HeroFontSize = "small" | "medium" | "large" | "xlarge";

export const HERO_FONT_FAMILIES = [
  { id: "playfair", label: "Playfair Display (Lüks Editoryal)", font: "'Playfair Display', Georgia, serif" },
  { id: "cormorant", label: "Cormorant Garamond (Michelin Zarafeti)", font: "'Cormorant Garamond', Garamond, serif" },
  { id: "cinzel", label: "Cinzel (Kraliyet Roma)", font: "Cinzel, 'Times New Roman', serif" },
  { id: "cinzel-dec", label: "Cinzel Decorative (İhtişamlı Saray)", font: "'Cinzel Decorative', Cinzel, serif" },
  { id: "bodoni", label: "Bodoni Moda (İtalyan Haute Couture)", font: "'Bodoni Moda', Didot, serif" },
  { id: "marcellus", label: "Marcellus (Antik Akdeniz)", font: "Marcellus, Georgia, serif" },
  { id: "greatvibes", label: "Great Vibes (İmza / Kaligrafi)", font: "'Great Vibes', cursive" },
  { id: "bebas", label: "Bebas Neue (Beach Club / Modern Güçlü)", font: "'Bebas Neue', Impact, sans-serif" },
  { id: "montserrat", label: "Montserrat (Zarif Geometrik)", font: "Montserrat, -apple-system, sans-serif" },
  { id: "jakarta", label: "Plus Jakarta Sans (Ultra Modern)", font: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: "serif", label: "Klasik Serif (Georgia / Times)", font: "Georgia, 'Times New Roman', serif" },
  { id: "sans", label: "Modern Sans (Sistem / Minimalist)", font: "system-ui, -apple-system, sans-serif" },
] as const;

export type HeroFontFamily = (typeof HERO_FONT_FAMILIES)[number]["id"];
export const HERO_FONT_FAMILY_IDS = new Set<string>(HERO_FONT_FAMILIES.map((item) => item.id));

export function resolveHeroFont(id?: HeroFontFamily): { fontFamily: string; letterSpacing?: string } {
  switch (id) {
    case "playfair":
      return { fontFamily: "'Playfair Display', Georgia, serif" };
    case "cormorant":
      return { fontFamily: "'Cormorant Garamond', Garamond, Georgia, serif", letterSpacing: "0.02em" };
    case "cinzel":
      return { fontFamily: "Cinzel, 'Times New Roman', serif", letterSpacing: "0.05em" };
    case "cinzel-dec":
      return { fontFamily: "'Cinzel Decorative', Cinzel, serif", letterSpacing: "0.04em" };
    case "bodoni":
      return { fontFamily: "'Bodoni Moda', Didot, Georgia, serif", letterSpacing: "0.03em" };
    case "marcellus":
      return { fontFamily: "Marcellus, Georgia, serif", letterSpacing: "0.03em" };
    case "greatvibes":
      return { fontFamily: "'Great Vibes', cursive", letterSpacing: "0.02em" };
    case "bebas":
      return { fontFamily: "'Bebas Neue', Impact, sans-serif", letterSpacing: "0.06em" };
    case "montserrat":
      return { fontFamily: "Montserrat, -apple-system, sans-serif", letterSpacing: "0.02em" };
    case "jakarta":
      return { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", letterSpacing: "-0.01em" };
    case "sans":
      return { fontFamily: "system-ui, -apple-system, sans-serif" };
    case "serif":
    default:
      return { fontFamily: "Georgia, 'Times New Roman', serif" };
  }
}

export const CALL_WAITER_POSITIONS = [
  { id: "STICKY_FOOTER", label: "Alt Sabit Bar (Sticky Footer)" },
  { id: "STICKY_HEADER", label: "Üst Sabit Başlık (Sticky Header)" },
  { id: "HERO_BOTTOM", label: "Başlığın / Hero'nun Hemen Altında" },
] as const;

export type CallWaiterPosition = (typeof CALL_WAITER_POSITIONS)[number]["id"];
export const CALL_WAITER_POSITION_IDS = new Set<string>(CALL_WAITER_POSITIONS.map((p) => p.id));

export type DesignOptions = {
  cardStyle: CardStyle;
  categoryTabStyle?: CategoryTabStyle;
  heroAlign?: HeroAlign;
  heroFontSize?: HeroFontSize;
  heroFontFamily?: HeroFontFamily;
  heroBgColor?: string;
  heroTextColor?: string;
  showImages: boolean;
  showAllergens: boolean;
  showTags: boolean;
  showPrices: boolean;
  uppercaseCategories: boolean;
  featuredTitle: string;
  typography: TypographyId;
  density: DensityId;
  hero: HeroStyle;
  /** Image of one of the outlet's own dishes; only used when hero is PHOTO. */
  heroImageUrl: string;
  /** Large photos only on up to three chef's picks; every other dish is a text row. */
  curatedPhotos: boolean;
  showSearch: boolean;
  showFilters: boolean;
  /** "Öne çıkanlar" strip (chef's pick / popular) above the dish list. Off unless the operator turns it on. */
  showFeatured: boolean;
  /** Customizable label for the Call Waiter button; empty falls back to the localized default. */
  callWaiterText: string;
  /** Placement of the Call Waiter button in the guest menu. */
  callWaiterPosition: CallWaiterPosition;
};

/** Values for the options added after the first designs were saved; a saved design without them looks as before. */
export const NEUTRAL_NEW_OPTIONS = {
  categoryTabStyle: "CHIPS_ROW",
  heroAlign: "left",
  heroFontSize: "medium",
  heroFontFamily: "serif",
  heroBgColor: "",
  heroTextColor: "",
  typography: "SYSTEM",
  density: "BALANCED",
  hero: "TITLE",
  heroImageUrl: "",
  curatedPhotos: false,
  showSearch: true,
  showFilters: false,
  showFeatured: false,
  callWaiterText: "",
  callWaiterPosition: "STICKY_FOOTER",
} as const satisfies Pick<
  DesignOptions,
  | "categoryTabStyle"
  | "heroAlign"
  | "heroFontSize"
  | "heroFontFamily"
  | "heroBgColor"
  | "heroTextColor"
  | "typography"
  | "density"
  | "hero"
  | "heroImageUrl"
  | "curatedPhotos"
  | "showSearch"
  | "showFilters"
  | "showFeatured"
  | "callWaiterText"
  | "callWaiterPosition"
>;

const options = (partial: Partial<DesignOptions> = {}): DesignOptions => ({
  cardStyle: "LIST",
  showImages: true,
  showAllergens: true,
  showTags: true,
  showPrices: true,
  uppercaseCategories: false,
  featuredTitle: "",
  ...NEUTRAL_NEW_OPTIONS,
  ...partial,
});

export const DESIGN_TEMPLATES = [
  // 1. RESORT (Otel & Resort)
  { id: "ROYAL", name: "Royal Signature", ambience: "RESORT", concept: "LUXURY", style: "royal", options: options({ cardStyle: "LIST", typography: "CLASSIC", uppercaseCategories: true, density: "AIRY" }) },
  { id: "GRANDE", name: "Grande Palace", ambience: "RESORT", concept: "CLASSIC", style: "grande", options: options({ cardStyle: "LIST", showImages: false, uppercaseCategories: true, typography: "CLASSIC", density: "AIRY" }) },
  { id: "ARTISAN_GRILL", name: "Artisan Smoke & Grill", ambience: "RESORT", concept: "RUSTIC", style: "artisan", options: options({ cardStyle: "CARD", typography: "MODERN", density: "COMPACT", uppercaseCategories: true }) },
  { id: "RESORT_PRESTIGE", name: "Resort Prestige Gallery", ambience: "RESORT", concept: "LUXURY", style: "prestige", options: options({ cardStyle: "PHOTO", typography: "MODERN", density: "BALANCED" }) },

  // 2. BEACH (Sahil & Beach Club)
  { id: "COASTAL", name: "Coastal Breeze", ambience: "BEACH", concept: "MEDITERRANEAN", style: "coastal", options: options({ cardStyle: "CARD", typography: "COASTAL", density: "BALANCED" }) },
  { id: "TROPIC", name: "Tropic Escape", ambience: "BEACH", concept: "NATURAL", style: "tropic", options: options({ cardStyle: "CARD", typography: "COASTAL", density: "BALANCED" }) },
  { id: "MYKONOS_CLUB", name: "Mykonos Sun & Beats", ambience: "BEACH", concept: "BOHEMIAN", style: "mykonos", options: options({ cardStyle: "PHOTO", typography: "COASTAL", density: "COMPACT" }) },
  { id: "AEGEAN_BREEZE", name: "Aegean Minimalist List", ambience: "BEACH", concept: "MEDITERRANEAN", style: "aegean", options: options({ cardStyle: "LIST", typography: "EDITORIAL", density: "AIRY", showImages: false }) },

  // 3. POOL (Havuz)
  { id: "POOL_CLUB", name: "Pool Club", ambience: "POOL", concept: "CONTEMPORARY", style: "pool", options: options({ cardStyle: "PHOTO", typography: "MODERN", density: "COMPACT" }) },
  { id: "AQUA_GOLD", name: "Aqua & Gold", ambience: "POOL", concept: "LUXURY", style: "aqua", options: options({ cardStyle: "CARD", typography: "CLASSIC", density: "AIRY", uppercaseCategories: true }) },
  { id: "LAGOON_DECK", name: "Lagoon Deck Bar", ambience: "POOL", concept: "CONTEMPORARY", style: "lagoon", options: options({ cardStyle: "LIST", typography: "HUMANIST", density: "BALANCED" }) },
  { id: "CABANA_POOL", name: "Poolside Riviera", ambience: "POOL", concept: "MEDITERRANEAN", style: "riviera", options: options({ cardStyle: "CARD", typography: "COASTAL", density: "AIRY" }) },

  // 4. LOUNGE (Lounge & Bar)
  { id: "NOIR_LOUNGE", name: "Noir Lounge", ambience: "LOUNGE", concept: "CLASSIC", style: "noir", options: options({ cardStyle: "LIST", uppercaseCategories: true, typography: "EDITORIAL", density: "COMPACT" }) },
  { id: "VELVET", name: "Velvet Room", ambience: "LOUNGE", concept: "LUXURY", style: "velvet", options: options({ cardStyle: "CARD", typography: "CLASSIC", density: "COMPACT" }) },
  { id: "ATRIUM_SOCIAL", name: "Atrium Social", ambience: "LOUNGE", concept: "CONTEMPORARY", style: "atrium", options: options({ cardStyle: "CARD", typography: "MODERN", density: "BALANCED" }) },
  { id: "CRYSTAL_BAR", name: "Crystal Champagne Bar", ambience: "LOUNGE", concept: "ART_DECO", style: "crystal", options: options({ cardStyle: "CARD", uppercaseCategories: true, typography: "EDITORIAL", density: "AIRY" }) },

  // 5. GOURMET (Fine Dining)
  { id: "GOURMET", name: "Gourmet Editorial", ambience: "GOURMET", concept: "LUXURY", style: "editorial", options: options({ cardStyle: "LIST", showImages: false, uppercaseCategories: true, typography: "EDITORIAL", density: "AIRY" }) },
  { id: "CHEF_TABLE", name: "Chef's Table", ambience: "GOURMET", concept: "CONTEMPORARY", style: "chef", options: options({ cardStyle: "LIST", typography: "EDITORIAL", density: "AIRY" }) },
  { id: "ZEN_ASIAN", name: "Zen Minimalist Lounge", ambience: "GOURMET", concept: "MINIMALIST", style: "zen", options: options({ cardStyle: "LIST", typography: "SERENITY", density: "AIRY", uppercaseCategories: true }) },
  { id: "SOMMELIER_CELLAR", name: "Sommelier Grand Cru", ambience: "GOURMET", concept: "CLASSIC", style: "cellar", options: options({ cardStyle: "CARD", typography: "CLASSIC", density: "BALANCED" }) },
  { id: "MICHELIN_ATELIER", name: "Michelin Degustation", ambience: "GOURMET", concept: "LUXURY", style: "degustation", options: options({ cardStyle: "PHOTO", typography: "EDITORIAL", density: "AIRY" }) },

  // 6. CAFE (Kafe & Patisserie)
  { id: "CAFE_ATELIER", name: "Café Atelier", ambience: "CAFE", concept: "NATURAL", style: "atelier", options: options({ cardStyle: "CARD", typography: "HUMANIST" }) },
  { id: "PATISSERIE", name: "Pâtisserie Moderne", ambience: "CAFE", concept: "CLASSIC", style: "patisserie", options: options({ cardStyle: "PHOTO", typography: "HUMANIST", density: "AIRY" }) },
  { id: "VIENNA_HERITAGE", name: "Vienna Grand Café", ambience: "CAFE", concept: "CLASSIC", style: "vienna", options: options({ cardStyle: "LIST", typography: "CLASSIC", uppercaseCategories: true, density: "AIRY" }) },
  { id: "ROASTERY_SPECIAL", name: "Artisan Roastery", ambience: "CAFE", concept: "CONTEMPORARY", style: "roastery", options: options({ cardStyle: "CARD", typography: "MODERN", density: "COMPACT", uppercaseCategories: true }) },

  // 7. SPA (Spa & Wellness)
  { id: "SPA_RITUAL", name: "Diamond Wellness Ritual", ambience: "SPA", concept: "NATURAL", style: "spa", options: options({ cardStyle: "CARD", typography: "HUMANIST", density: "AIRY", showPrices: false }) },
  { id: "HAMAM_HERITAGE", name: "Hamam Heritage", ambience: "SPA", concept: "CLASSIC", style: "hamam", options: options({ cardStyle: "LIST", typography: "CLASSIC", density: "AIRY", showPrices: false }) },
  { id: "THERMAL_HOLISTIC", name: "Holistic Thermal Spa", ambience: "SPA", concept: "NATURAL", style: "holistic", options: options({ cardStyle: "PHOTO", typography: "SERENITY", density: "AIRY", showPrices: false }) },
  { id: "ZEN_SANCTUARY", name: "Zen Sanctuary Ritual", ambience: "SPA", concept: "MINIMALIST", style: "sanctuary", options: options({ cardStyle: "CARD", typography: "SERENITY", density: "AIRY", showPrices: false }) },

  // 8. GARDEN (Aile & Bahçe)
  { id: "FAMILY_GARDEN", name: "Meritta Family Garden", ambience: "GARDEN", concept: "NATURAL", style: "garden", options: options({ cardStyle: "CARD", typography: "HUMANIST" }) },
  { id: "ORCHARD_BREEZE", name: "Citrus Orchard & Lawn", ambience: "GARDEN", concept: "NATURAL", style: "orchard", options: options({ cardStyle: "LIST", typography: "HUMANIST", density: "BALANCED" }) },
  { id: "PICNIC_GOURMET", name: "Garden Pergola & Grill", ambience: "GARDEN", concept: "RUSTIC", style: "pergola", options: options({ cardStyle: "PHOTO", typography: "CLASSIC", density: "BALANCED" }) },

  // 9. SPORT (Spor & Aktivite)
  { id: "ACTIVE_HYDRATION", name: "Active Hydration", ambience: "SPORT", concept: "CONTEMPORARY", style: "active", options: options({ cardStyle: "CARD", typography: "MODERN", density: "COMPACT", uppercaseCategories: true }) },
  { id: "COURT_CLUB", name: "Tennis & Court Clubhouse", ambience: "SPORT", concept: "CONTEMPORARY", style: "clubhouse", options: options({ cardStyle: "LIST", typography: "MODERN", density: "BALANCED" }) },
  { id: "POWER_SMOOTHIE", name: "Power Vitality Bar", ambience: "SPORT", concept: "NATURAL", style: "vitality", options: options({ cardStyle: "PHOTO", typography: "HUMANIST", density: "BALANCED" }) },

  // 10. ROOFTOP (Teras & Sky Bar)
  { id: "MIDNIGHT_ROOF", name: "Midnight Sky Lounge", ambience: "ROOFTOP", concept: "LUXURY", style: "midnight", options: options({ cardStyle: "CARD", typography: "SERENITY", density: "COMPACT" }) },
  { id: "SUNSET_SKY_TERRACE", name: "Sunset Golden Hour", ambience: "ROOFTOP", concept: "BOHEMIAN", style: "goldenhour", options: options({ cardStyle: "PHOTO", typography: "COASTAL", density: "BALANCED" }) },
  { id: "STARLIGHT_DECK", name: "Starlight Panorama Deck", ambience: "ROOFTOP", concept: "CONTEMPORARY", style: "starlight", options: options({ cardStyle: "LIST", typography: "MODERN", density: "AIRY" }) },

  // 11. NIGHTCLUB (Gece Kulübü & Canlı Müzik)
  { id: "ELECTRIC_VIP", name: "Electric VIP Club", ambience: "NIGHTCLUB", concept: "LUXURY", style: "electric", options: options({ cardStyle: "PHOTO", typography: "MODERN", density: "COMPACT" }) },
  { id: "LIVE_STAGE_JAZZ", name: "Live Stage & Jazz Speakeasy", ambience: "NIGHTCLUB", concept: "CLASSIC", style: "jazz", options: options({ cardStyle: "LIST", typography: "EDITORIAL", uppercaseCategories: true }) },
  { id: "NEON_PULSE", name: "Neon Pulse High-Energy", ambience: "NIGHTCLUB", concept: "CONTEMPORARY", style: "pulse", options: options({ cardStyle: "CARD", typography: "MODERN", density: "COMPACT" }) },

  // 12. CABANA (Özel Kabana & VIP Loca)
  { id: "SUNSET_CABANA", name: "Sunset VIP Cabana", ambience: "CABANA", concept: "BOHEMIAN", style: "cabana", options: options({ cardStyle: "PHOTO", typography: "COASTAL" }) },
  { id: "PRIVATE_ISLAND", name: "Private Island Gazebo", ambience: "CABANA", concept: "LUXURY", style: "gazebo", options: options({ cardStyle: "CARD", typography: "SERENITY", density: "AIRY" }) },
  { id: "MOET_CABANA", name: "Dom Pérignon Cabana Club", ambience: "CABANA", concept: "ART_DECO", style: "moet", options: options({ cardStyle: "LIST", typography: "EDITORIAL", uppercaseCategories: true }) },

  // 13. PATIO (Avlu & Kış Bahçesi)
  { id: "BOTANICAL_BISTRO", name: "Botanical Glasshouse", ambience: "PATIO", concept: "NATURAL", style: "botanical", options: options({ cardStyle: "CARD", typography: "HUMANIST" }) },
  { id: "COURTYARD_TAPAS", name: "Courtyard Olive Grove", ambience: "PATIO", concept: "RUSTIC", style: "courtyard", options: options({ cardStyle: "LIST", typography: "HUMANIST", density: "BALANCED" }) },
  { id: "WINTER_ORANGERIE", name: "Winter Orangerie Salon", ambience: "PATIO", concept: "CLASSIC", style: "orangerie", options: options({ cardStyle: "PHOTO", typography: "CLASSIC", density: "AIRY" }) },
  { id: "SUNLIT_VERANDA", name: "Sunlit Veranda & Pergola", ambience: "PATIO", concept: "DAYLIGHT", style: "daylight", options: options({ cardStyle: "CARD", typography: "HUMANIST", density: "AIRY" }) },

  // 14. SUNDECK (Güneşlenme Terası & Sundeck) - Açık & Ferah Şablonlar
  { id: "WHITE_RIVIERA", name: "White Riviera Sundeck", ambience: "SUNDECK", concept: "RIVIERA", style: "daylight", options: options({ cardStyle: "CARD", categoryTabStyle: "SEGMENT_CARDS", heroAlign: "center", typography: "COASTAL", density: "AIRY" }) },
  { id: "SANTORINI_TERRACE", name: "Santorini Breeze Terrace", ambience: "SUNDECK", concept: "DAYLIGHT", style: "santorini", options: options({ cardStyle: "PHOTO", typography: "COASTAL", density: "BALANCED" }) },
  { id: "LINEN_LOUNGER", name: "Linen & Sun Lounger", ambience: "SUNDECK", concept: "NORDIC", style: "linen", options: options({ cardStyle: "LIST", typography: "SERENITY", density: "AIRY" }) },

  // 15. BRUNCH (Sabah Kahvaltısı & Brunch) - Açık & Ferah Şablonlar
  { id: "MORNING_TERRACE", name: "Morning Sun & Croissant", ambience: "BRUNCH", concept: "DAYLIGHT", style: "brunch", options: options({ cardStyle: "PHOTO", typography: "HUMANIST", density: "AIRY" }) },
  { id: "PASTEL_BOULANGERIE", name: "Pastel Boulangerie & Tea", ambience: "BRUNCH", concept: "PASTEL", style: "pastel", options: options({ cardStyle: "CARD", typography: "CLASSIC", density: "AIRY" }) },
  { id: "NORDIC_BREAKFAST", name: "Nordic Daylight Table", ambience: "BRUNCH", concept: "NORDIC", style: "nordic", options: options({ cardStyle: "LIST", typography: "MODERN", density: "BALANCED" }) },

  // 16. SEAFOOD (Deniz Ürünleri & Marina) - Açık & Ferah Şablonlar
  { id: "AEGEAN_MARINA", name: "Aegean White Marina", ambience: "SEAFOOD", concept: "RIVIERA", style: "marina", options: options({ cardStyle: "PHOTO", typography: "COASTAL", density: "AIRY" }) },
  { id: "PEARL_OYSTER", name: "Pearl & Oyster Raw Bar", ambience: "SEAFOOD", concept: "DAYLIGHT", style: "pearl", options: options({ cardStyle: "LIST", typography: "EDITORIAL", density: "AIRY", uppercaseCategories: true }) },
  { id: "BLUE_LAGOON_FISH", name: "Blue Sea Fish House", ambience: "SEAFOOD", concept: "MEDITERRANEAN", style: "coastal", options: options({ cardStyle: "CARD", typography: "COASTAL", density: "BALANCED" }) },

  // Ek Açık & Gün Işığı Şablonları (Mevcut Ambiyanslar İçin)
  { id: "IVORY_PALACE", name: "Ivory Daylight Palace", ambience: "RESORT", concept: "DAYLIGHT", style: "daylight", options: options({ cardStyle: "CARD", typography: "CLASSIC", density: "AIRY", uppercaseCategories: true }) },
  { id: "SUNLIGHT_POOL", name: "Sunlight Aqua Deck", ambience: "POOL", concept: "DAYLIGHT", style: "santorini", options: options({ cardStyle: "CARD", typography: "MODERN", density: "AIRY" }) },
  { id: "DAYLIGHT_LOUNGE", name: "Daylight Lobby Conservatory", ambience: "LOUNGE", concept: "DAYLIGHT", style: "linen", options: options({ cardStyle: "CARD", typography: "SERENITY", density: "AIRY" }) },
  { id: "LUMIERE_DINING", name: "Lumière Fine Dining", ambience: "GOURMET", concept: "DAYLIGHT", style: "pearl", options: options({ cardStyle: "CARD", typography: "EDITORIAL", density: "AIRY", uppercaseCategories: true }) },
  { id: "ROSE_PATISSERIE", name: "Rose & Champagne Salon", ambience: "CAFE", concept: "PASTEL", style: "pastel", options: options({ cardStyle: "PHOTO", typography: "CLASSIC", density: "AIRY" }) },
  // Açık zeminli klasik bar: krem kağıt, çift çizgili başlık, serif fiyat listesi (viski & konyak evi).
  { id: "COGNAC_LIBRARY", name: "Cognac Library Salon", ambience: "LOUNGE", concept: "CLASSIC", style: "library", options: options({ cardStyle: "LIST", categoryTabStyle: "UNDERLINE_TABS", heroAlign: "center", heroFontFamily: "cormorant", heroFontSize: "large", typography: "SYSTEM", density: "AIRY", uppercaseCategories: true }) },
] as const;

/**
 * Template styles designed around a dark room (neon glow, smoked glass). Their surfaces follow the theme colours,
 * and they stay in the catalog for operators who pick a dark theme, but no built-in outlet preset uses them.
 */
export const DARK_TEMPLATE_STYLES: ReadonlySet<string> = new Set(["noir", "midnight", "velvet", "electric", "pulse", "jazz", "starlight"]);

export const DESIGN_BLOCKS = [
  { id: "hero", label: "Karşılama alanı", description: "Otel ve outlet girişi" },
  { id: "categories", label: "Kategori gezintisi", description: "Yapışkan kategori sekmeleri, arama ve etiket süzgeci" },
  { id: "items", label: "Menü içerikleri", description: "Öne çıkanlar, alt kategoriler ve ürünler" },
] as const;

export const CARD_STYLES: { id: CardStyle; label: string }[] = [
  { id: "LIST", label: "Liste" },
  { id: "CARD", label: "Kart" },
  { id: "PHOTO", label: "Fotoğraf" },
];

export type AmbienceId = (typeof AMBIENCES)[number]["id"];
export type ConceptId = (typeof CONCEPTS)[number]["id"];
export type TemplateId = (typeof DESIGN_TEMPLATES)[number]["id"];
export type DesignBlockId = (typeof DESIGN_BLOCKS)[number]["id"];
export type ItemTagId = (typeof ITEM_TAG_IDS)[number];

export type OutletDesign = {
  ambience: AmbienceId;
  concept: ConceptId;
  template: TemplateId;
  layout: DesignBlockId[];
  options: DesignOptions;
};

export const DEFAULT_OUTLET_DESIGN: OutletDesign = {
  ambience: "RESORT",
  concept: "LUXURY",
  template: "ROYAL",
  layout: ["hero", "categories", "items"],
  options: options(),
};

const CARD_STYLE_IDS = new Set<CardStyle>(["LIST", "CARD", "PHOTO"]);
const AMBIENCE_IDS = new Set<string>(AMBIENCES.map((item) => item.id));
const CONCEPT_IDS = new Set<string>(CONCEPTS.map((item) => item.id));
const BLOCK_IDS = new Set<string>(DESIGN_BLOCKS.map((item) => item.id));
const TYPOGRAPHY_IDS = new Set<string>(TYPOGRAPHIES.map((item) => item.id));
const DENSITY_IDS = new Set<string>(DENSITIES.map((item) => item.id));
const HERO_IDS = new Set<string>(HERO_STYLES.map((item) => item.id));
const UPLOAD_PREFIX = "/uploads/";
const MERIT_MENU_PREFIX = "/merit-menus/";
const MAX_HERO_URL = 300;

function heroUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim();
  return (url.startsWith(UPLOAD_PREFIX) || url.startsWith(MERIT_MENU_PREFIX)) && url.length <= MAX_HERO_URL ? url : "";
}

/** Hero colours: only `#rrggbb` (or empty = theme colour); anything else keeps the preset value. */
function heroColor(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return color === "" || /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function normalizeLayout(value: unknown): DesignBlockId[] {
  if (!Array.isArray(value) || value.length !== DESIGN_BLOCKS.length) return [...DEFAULT_OUTLET_DESIGN.layout];
  if (new Set(value).size !== value.length) return [...DEFAULT_OUTLET_DESIGN.layout];
  if (!value.every((item) => typeof item === "string" && BLOCK_IDS.has(item))) return [...DEFAULT_OUTLET_DESIGN.layout];
  const list = value as DesignBlockId[];
  // Kategori gezintisi (sekmeler, arama ve filtreler) daima menü içeriklerinin (ürünlerin) üzerinde yer almalıdır.
  if (list.indexOf("categories") > list.indexOf("items")) {
    return ["hero", "categories", "items"];
  }
  return list;
}

function normalizeOptions(value: unknown, preset: DesignOptions): DesignOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...preset };
  const raw = value as Partial<DesignOptions>;
  if (Object.keys(raw).length === 0) return { ...preset };
  const featured = typeof raw.featuredTitle === "string" ? raw.featuredTitle.trim().slice(0, 40) : preset.featuredTitle;
  return {
    cardStyle: raw.cardStyle && CARD_STYLE_IDS.has(raw.cardStyle) ? raw.cardStyle : preset.cardStyle,
    categoryTabStyle: raw.categoryTabStyle && CATEGORY_TAB_STYLE_IDS.has(raw.categoryTabStyle) ? raw.categoryTabStyle : (preset.categoryTabStyle ?? "CHIPS_ROW"),
    showImages: typeof raw.showImages === "boolean" ? raw.showImages : preset.showImages,
    showAllergens: typeof raw.showAllergens === "boolean" ? raw.showAllergens : preset.showAllergens,
    showTags: typeof raw.showTags === "boolean" ? raw.showTags : preset.showTags,
    showPrices: typeof raw.showPrices === "boolean" ? raw.showPrices : preset.showPrices,
    uppercaseCategories: typeof raw.uppercaseCategories === "boolean" ? raw.uppercaseCategories : preset.uppercaseCategories,
    featuredTitle: featured,
    typography: raw.typography && TYPOGRAPHY_IDS.has(raw.typography) ? raw.typography : NEUTRAL_NEW_OPTIONS.typography,
    density: raw.density && DENSITY_IDS.has(raw.density) ? raw.density : NEUTRAL_NEW_OPTIONS.density,
    hero: raw.hero && HERO_IDS.has(raw.hero) ? raw.hero : NEUTRAL_NEW_OPTIONS.hero,
    heroImageUrl: heroUrl(raw.heroImageUrl),
    curatedPhotos: typeof raw.curatedPhotos === "boolean" ? raw.curatedPhotos : NEUTRAL_NEW_OPTIONS.curatedPhotos,
    showSearch: typeof raw.showSearch === "boolean" ? raw.showSearch : NEUTRAL_NEW_OPTIONS.showSearch,
    showFilters: typeof raw.showFilters === "boolean" ? raw.showFilters : NEUTRAL_NEW_OPTIONS.showFilters,
    showFeatured: typeof raw.showFeatured === "boolean" ? raw.showFeatured : NEUTRAL_NEW_OPTIONS.showFeatured,
    heroAlign: raw.heroAlign && ["left", "center", "right"].includes(raw.heroAlign) ? raw.heroAlign : preset.heroAlign,
    heroFontSize: raw.heroFontSize && ["small", "medium", "large", "xlarge"].includes(raw.heroFontSize) ? raw.heroFontSize : preset.heroFontSize,
    heroFontFamily: raw.heroFontFamily && HERO_FONT_FAMILY_IDS.has(raw.heroFontFamily) ? (raw.heroFontFamily as HeroFontFamily) : preset.heroFontFamily,
    heroBgColor: heroColor(raw.heroBgColor, preset.heroBgColor),
    heroTextColor: heroColor(raw.heroTextColor, preset.heroTextColor),
    callWaiterText: typeof raw.callWaiterText === "string" ? raw.callWaiterText.trim().slice(0, 40) : preset.callWaiterText,
    callWaiterPosition: raw.callWaiterPosition && CALL_WAITER_POSITION_IDS.has(raw.callWaiterPosition) ? (raw.callWaiterPosition as CallWaiterPosition) : (preset.callWaiterPosition ?? NEUTRAL_NEW_OPTIONS.callWaiterPosition),
  };
}

/** Turns a stored outlet design into a complete, safe design. Unknown values fall back to the template. */
export function designFromStored(row: {
  ambience?: string | null;
  concept?: string | null;
  template?: string | null;
  layout?: unknown;
  options?: unknown;
} | null | undefined): OutletDesign {
  const template = DESIGN_TEMPLATES.find((item) => item.id === row?.template) ?? DESIGN_TEMPLATES[0];
  return {
    ambience: row?.ambience && AMBIENCE_IDS.has(row.ambience) ? (row.ambience as AmbienceId) : template.ambience,
    concept: row?.concept && CONCEPT_IDS.has(row.concept) ? (row.concept as ConceptId) : template.concept,
    template: template.id,
    layout: normalizeLayout(row?.layout),
    options: normalizeOptions(row?.options, template.options),
  };
}

/** A template's starting design. Category navigation stays above the dishes; the editor can reorder it. */
export function templatePreset(id: TemplateId): OutletDesign {
  const template = DESIGN_TEMPLATES.find((item) => item.id === id) ?? DESIGN_TEMPLATES[0];
  return designFromStored({
    ambience: template.ambience,
    concept: template.concept,
    template: template.id,
    layout: ["hero", "categories", "items"],
    options: template.options,
  });
}
