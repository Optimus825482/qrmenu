/** EU 1169/2011 Annex II allergen codes. Display names live in the guest i18n messages. */
export const ALLERGENS = [
  "gluten",
  "sut",
  "yumurta",
  "kuruyemis",
  "yerfistigi",
  "deniz_urunu",
  "yumusakca",
  "balik",
  "alkol",
  "soya",
  "susam",
  "kereviz",
  "hardal",
  "sulfit",
  "acibakla",
] as const;
export type AllergenKey = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<AllergenKey, string> = {
  gluten: "Gluten içeren tahıl",
  sut: "Süt ve süt ürünleri",
  yumurta: "Yumurta",
  kuruyemis: "Sert kabuklu yemişler",
  yerfistigi: "Yer fıstığı",
  deniz_urunu: "Kabuklu deniz ürünü",
  yumusakca: "Yumuşakça",
  balik: "Balık",
  alkol: "Alkol",
  soya: "Soya",
  susam: "Susam",
  kereviz: "Kereviz",
  hardal: "Hardal",
  sulfit: "Sülfit / Kükürt dioksit",
  acibakla: "Acı bakla",
};

export const ALLERGEN_INFO: Record<
  AllergenKey,
  { label: string; shortLabel: string; description: string; examples: string }
> = {
  gluten: {
    label: "Gluten içeren tahıl",
    shortLabel: "Gluten",
    description: "Buğday, çavdar, arpa, yulaf ve bunlardan yapılan unlu mamuller.",
    examples: "Ekmek, lavaş, pide, makarna, pizza, burger ekmeği, şinitzel panesi, bira, pasta, börek",
  },
  sut: {
    label: "Süt ve süt ürünleri (Laktoz dahil)",
    shortLabel: "Süt",
    description: "İnek, koyun, keçi sütü ve peynir, tereyağı, krema, yoğurt, dondurma türevleri.",
    examples: "Cappuccino, Latte, Milkshake, dondurma, peynir tabağı, tereyağlı soslar, çikolata",
  },
  yumurta: {
    label: "Yumurta ve yumurta ürünleri",
    shortLabel: "Yumurta",
    description: "Yumurta akı, sarısı, mayonez, mereng, pane harçları ve pastacılık kremaları.",
    examples: "Omlet, menemen, şinitzel, mayonezli soslar, Sezar sos, pasta, pankek, waffle",
  },
  kuruyemis: {
    label: "Sert kabuklu meyveler / yemişler",
    shortLabel: "Kuruyemiş",
    description: "Ceviz, fındık, Antep fıstığı, badem, kaju, pikan cevizi.",
    examples: "Baklava, künefe, Gavurdağı salatası, müsli, granola, pesto sos, fıstıklı tatlılar",
  },
  yerfistigi: {
    label: "Yer fıstığı",
    shortLabel: "Yer fıstığı",
    description: "Yer fıstığı, fıstık ezmesi ve yer fıstığı yağı içeren ürünler.",
    examples: "Bar çerezi, Satay soslu Asya yemekleri, fıstık ezmeli tatlılar",
  },
  deniz_urunu: {
    label: "Kabuklu deniz ürünleri",
    shortLabel: "Kabuklu deniz",
    description: "Karides, ıstakoz, kerevit, yengeç ve karides özlü soslar.",
    examples: "Karides güveç, ızgara jumbo karides, deniz mahsullü makarna, Paella",
  },
  yumusakca: {
    label: "Yumuşakçalar",
    shortLabel: "Yumuşakça",
    description: "Kalamar, ahtapot, midye, istiridye, deniz tarağı.",
    examples: "Kalamar tava, ızgara ahtapot, midye dolma, Eftelya deniz salatası",
  },
  balik: {
    label: "Balık",
    shortLabel: "Balık",
    description: "Tüm tatlı ve tuzlu su balıkları, hamsi/ançüez bazlı soslar.",
    examples: "Levrek, çipura, somon, sushi, Sezar sos (ançüez), balık çorbası",
  },
  alkol: {
    label: "Alkol (Etanol)",
    shortLabel: "Alkol",
    description: "Fermente veya distile alkollü içecekler ve alkolle flambe edilen soslar.",
    examples: "Viski, votka, cin, rom, tekila, rakı, şarap, bira, kokteyller, tiramisu (likörlü)",
  },
  soya: {
    label: "Soya fasulyesi ve ürünleri",
    shortLabel: "Soya",
    description: "Soya sosu, soya sütü, tofu, edamame ve soya lesitini (çikolata/sos).",
    examples: "Sushi, Wok yemekleri, soya soslu tavuk/et, soya sütlü kahve/müsli",
  },
  susam: {
    label: "Susam tohumu ve ürünleri",
    shortLabel: "Susam",
    description: "Susam, tahin, susam yağı.",
    examples: "Simit, humus, tahin-pekmez, babagannuş, burger ekmeği, sushi roll",
  },
  kereviz: {
    label: "Kereviz",
    shortLabel: "Kereviz",
    description: "Kereviz kökü, sapı, yaprağı ve sebze suyu/et suyu çeşnileri.",
    examples: "Zeytinyağlı kereviz, Bloody Mary, çorbalar, buffalo kanat sosları",
  },
  hardal: {
    label: "Hardal",
    shortLabel: "Hardal",
    description: "Hardal tohumu, Dijon hardalı, ballı hardal sos ve marinasyonlar.",
    examples: "Hardal soslu salata, burger sosu, Sezar sos, şarküteri tabağı",
  },
  sulfit: {
    label: "Kükürt dioksit ve sülfitler (>10 mg/kg)",
    shortLabel: "Sülfit",
    description: "Şarap, bira, kuru meyveler ve sirke/turşu ürünlerinde koruyucu sülfitler.",
    examples: "Kırmızı/beyaz/roze şarap, şampanya, bira, kuru kayısı/incir, şaraplı kokteyller",
  },
  acibakla: {
    label: "Acı bakla (Lupin)",
    shortLabel: "Acı bakla",
    description: "Bazı glutensiz un karışımlarında ve Akdeniz mezelerinde kullanılan baklagil.",
    examples: "Özel pastacılık unları, geleneksel acı bakla mezesi",
  },
};

export interface AllergenPreset {
  id: string;
  label: string;
  category: string;
  description: string;
  allergens: AllergenKey[];
}

/**
 * Sistemde hazır seçilebilir mutfak ve içecek alerjen şablonları.
 */
export const ALLERGEN_PRESETS: readonly AllergenPreset[] = [
  {
    id: "sutlu_kahve_icecek",
    label: "Sütlü Kahve / Milkshake / Ayran",
    category: "İçecek",
    description: "Cappuccino, Latte, Flat White, Milkshake, Sıcak Çikolata, Ayran",
    allergens: ["sut"],
  },
  {
    id: "sarap_kokteyl",
    label: "Şarap / Şampanya / Vermutlu Kokteyl",
    category: "Alkollü İçecek",
    description: "Kırmızı, Beyaz, Roze Şaraplar, Prosecco, Sangria, Aperol Spritz",
    allergens: ["alkol", "sulfit"],
  },
  {
    id: "saf_distile_icki",
    label: "Distile İçki & Klasik Kokteyl (Viski, Votka, Cin, Rom)",
    category: "Alkollü İçecek",
    description: "Viski, Votka, Cin, Tekila, Rom, Rakı, Mojito, Margarita",
    allergens: ["alkol"],
  },
  {
    id: "bira_malt",
    label: "Bira & Malt İçecekler",
    category: "Alkollü İçecek",
    description: "Arpa/buğday maltı içeren fıçı ve şişe biralar",
    allergens: ["alkol", "gluten", "sulfit"],
  },
  {
    id: "izgara_lavas_ekmek",
    label: "Lavaş / Pide / Ekmek Eşlikli Izgara Et & Tavuk",
    category: "Ana Yemek",
    description: "El yapımı lavaş veya pide ile servis edilen kanat, şaşlık, kebap, köfte",
    allergens: ["gluten"],
  },
  {
    id: "schnitzel_pane",
    label: "Şinitzel / Pane / Çıtır Tavuk & Atıştırmalık",
    category: "Atıştırmalık & Ana Yemek",
    description: "Un ve yumurta ile panelenmiş tavuk şinitzel, çıtır tavuk, soğan halkası",
    allergens: ["gluten", "yumurta"],
  },
  {
    id: "buffalo_kanat_soslu",
    label: "Soslu / Buffalo Tavuk Kanatları",
    category: "Atıştırmalık",
    description: "Tereyağlı acı buffalo sos veya ballı hardal soslu kanat",
    allergens: ["sut", "hardal", "kereviz"],
  },
  {
    id: "burger_pizza_makarna",
    label: "Burger / Pizza / Makarna / Tost / Sandviç",
    category: "Snack & Ana Yemek",
    description: "Buğday unu, peynir ve yumurta/sos içeren klasik snack ürünleri",
    allergens: ["gluten", "sut", "yumurta"],
  },
  {
    id: "pasta_patisserie",
    label: "Pasta / Kek / Waffle / Pankek / Kruvasan",
    category: "Tatlı & Patisserie",
    description: "Un, süt/krema ve yumurta içeren pastacılık ürünleri",
    allergens: ["gluten", "sut", "yumurta"],
  },
  {
    id: "baklava_kuruyemisli_tatli",
    label: "Baklava / Künefe / Fıstıklı & Cevizli Tatlı",
    category: "Tatlı",
    description: "Yufka/kadayıf, tereyağı/kaymak ve Antep fıstığı/ceviz içeren tatlılar",
    allergens: ["gluten", "sut", "kuruyemis"],
  },
  {
    id: "dondurma_sutlu",
    label: "Dondurma (Sütlü & Kuruyemiş Opsiyonlu)",
    category: "Tatlı",
    description: "Kaymaklı, çikolatalı, Antep fıstıklı, cevizli top dondurma çeşitleri",
    allergens: ["sut", "kuruyemis", "gluten"],
  },
  {
    id: "peynir_kahvalti",
    label: "Peynir Tabağı / Hellim / Süt Ürünleri",
    category: "Kahvaltı & Meze",
    description: "Ezine, tulum, kaşar, hellim ızgara ve şarküteri peynirleri",
    allergens: ["sut"],
  },
  {
    id: "deniz_urunleri_kabuklu",
    label: "Karides / Kalamar / Ahtapot / Deniz Mahsulleri",
    category: "Deniz Ürünleri",
    description: "Karides güveç, kalamar tava, ahtapot ızgara, deniz mahsullü salata",
    allergens: ["deniz_urunu", "yumusakca"],
  },
  {
    id: "balik_izgara_tava",
    label: "Izgara / Tava Balık (Levrek, Çipura, Somon)",
    category: "Deniz Ürünleri",
    description: "Taze mevsim balıkları, somon, levrek marin",
    allergens: ["balik"],
  },
  {
    id: "asya_sushi_wok",
    label: "Sushi / Asya Mutfağı / Noodle",
    category: "Asya & Sushi",
    description: "Balık, karides, soya sosu, susam ve gluten içeren Uzak Doğu yemekleri",
    allergens: ["balik", "deniz_urunu", "soya", "susam", "gluten"],
  },
  {
    id: "sezar_ozel_salata",
    label: "Sezar Salata (Kruton, Parmesan, Sezar Sos)",
    category: "Salata",
    description: "Kızarmış ekmek (gluten), parmesan (süt), yumurta, ançüez (balık), hardal",
    allergens: ["gluten", "sut", "yumurta", "balik", "hardal"],
  },
  {
    id: "cevizli_salata_musli",
    label: "Cevizli Salata (Gavurdağı) / Müsli & Granola",
    category: "Salata & Kahvaltı",
    description: "Ceviz, badem, fındık içeren salata ve tahıl kaseleri",
    allergens: ["kuruyemis"],
  },
  {
    id: "humus_tahin_meze",
    label: "Humus / Tahinli & Susamlı Meze",
    category: "Meze",
    description: "Tahin ve susam yağı içeren soğuk mezeler",
    allergens: ["susam"],
  },
];

/**
 * Ürün adı, açıklaması ve kategorisine göre akıllı alerjen çıkarımı yapar.
 */
export function inferAllergensForItem(input: {
  name: string;
  detail?: string | null;
  categoryPath?: string;
}): {
  allergens: AllergenKey[];
  presetId?: string;
  reason: string;
  isNaturallyAllergenFree: boolean;
} {
  const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i");
  const hay = norm(`${input.categoryPath ?? ""} ${input.name} ${input.detail ?? ""}`);
  const nameLow = norm(input.name);
  const found = new Set<AllergenKey>();
  let presetId: string | undefined;
  let reason = "";

  // 1. Check milk-based coffee & drinks first
  if (
    /milkshake|cappuccino|flat white|latte|macchiato|mocha|sicak çikolata|sahlep|ayran|kefir|frappe/.test(nameLow)
  ) {
    found.add("sut");
    presetId = "sutlu_kahve_icecek";
    reason = "Süt / krema bazlı içecek";
  }

  // 2. Check breaded / schnitzel items
  if (/şinitzel|schnitzel|pane|nugget|çitir tavuk|soğan halkasi|tempura/.test(hay)) {
    found.add("gluten");
    found.add("yumurta");
    presetId = "schnitzel_pane";
    reason = "Pane harcı (buğday unu ve yumurta)";
  }

  // 3. Check wings with buffalo / honey sauce
  if (/kanat|wings/.test(nameLow) && /buffalo|sos/.test(hay)) {
    found.add("sut");
    found.add("hardal");
    found.add("kereviz");
    presetId = presetId ?? "buffalo_kanat_soslu";
    reason = "Buffalo / özel kanat sosu (tereyağı, hardal, kereviz çeşnisi)";
  }

  // 4. Check bread / lavash / flour items
  if (
    /lavaş|ekmek|pide|simit|poğaça|börek|pişi|lahmacun|manti|makarna|spaghetti|penne|tagliatelle|fettuccine|pizza|burger|sandviç|tost|tortilla|wrap|kruvasan|kek|pasta|waffle|pankek|tart|cheesecake|tiramisu|baklava|künefe|kadayif|oreo|cookies|bisküvi/.test(
      hay,
    )
  ) {
    found.add("gluten");
    if (!presetId) {
      presetId = "izgara_lavas_ekmek";
      reason = "Buğday unu / lavaş / ekmek / hamur işi içerir";
    }
  }

  // 5. Check dairy / cheese / butter / ice cream
  if (
    /peynir|cheddar|parmesan|mozzarella|hellim|ezine|kaşar|tulum|lor|tereyağ|kaymak|krema|yoğurt|süt|dondurma|mascarpone|nutella|çikolata/.test(
      hay,
    )
  ) {
    found.add("sut");
    if (!presetId) {
      presetId = "peynir_kahvalti";
      reason = "Süt ürünü / peynir / tereyağı / krema içerir";
    }
  }

  // 6. Check egg
  if (/yumurta|omlet|menemen|mayonez|sezar sos|pankek|waffle|pasta|kek|börek|tiramisu/.test(hay)) {
    found.add("yumurta");
  }

  // 7. Check nuts
  if (/ceviz|findik|fistik|antep fistiği|badem|kaju|müsli|musli|granola|gavurdaği|pestolu|pesto/.test(hay)) {
    found.add("kuruyemis");
    if (!presetId) {
      presetId = "cevizli_salata_musli";
      reason = "Ceviz / fındık / badem / Antep fıstığı içerir";
    }
  }

  // 8. Check shellfish & molluscs
  if (/karides|istakoz|yengeç|kerevit|shrimp|prawn/.test(hay)) {
    found.add("deniz_urunu");
    presetId = "deniz_urunleri_kabuklu";
    reason = "Kabuklu deniz ürünü (karides vb.) içerir";
  }
  if (/kalamar|ahtapot|midye|istiridye|calamari|octopus/.test(hay)) {
    found.add("yumusakca");
    presetId = "deniz_urunleri_kabuklu";
    reason = "Yumuşakça (kalamar/ahtapot/midye) içerir";
  }

  // 9. Check fish
  if (/balik|levrek|çipura|somon|ton baliğı|akya|trança|kalkan|lüfer|palamut|anchovy|ançüez|sezar sos/.test(hay)) {
    found.add("balik");
    if (!presetId) {
      presetId = "balik_izgara_tava";
      reason = "Balık ürünü içerir";
    }
  }

  // 10. Check sesame & soy
  if (/susam|tahin|humus|babagannuş|simit/.test(hay)) {
    found.add("susam");
    if (!presetId) {
      presetId = "humus_tahin_meze";
      reason = "Susam / tahin içerir";
    }
  }
  if (/soya|sushi|edamame|teriyaki|wok/.test(hay)) {
    found.add("soya");
  }

  // 11. Check wine, beer, alcohol
  if (/şarap|wine|merlot|cabernet|shiraz|syrah|chardonnay|sauvignon|prosecco|champagne|şampanya|rose|roze|amarone|barolo|chianti|malbec|tempranillo/.test(hay)) {
    found.add("alkol");
    found.add("sulfit");
    presetId = "sarap_kokteyl";
    reason = "Şarap / fermente üzüm ürünü (alkol ve sülfit)";
  } else if (/bira|beer|efes|miller|corona|heineken|carlsberg|bomonti|guinness|becks/.test(hay)) {
    found.add("alkol");
    found.add("gluten");
    found.add("sulfit");
    presetId = "bira_malt";
    reason = "Arpa maltı bazlı fermente içecek";
  } else if (/viski|whisky|whiskey|votka|vodka|cin\b|gin\b|rom\b|rum\b|tekila|tequila|raki|likör|konyak|cognac|kokteyl|mojito|margarita|negroni|martini/.test(hay)) {
    found.add("alkol");
    presetId = "saf_distile_icki";
    reason = "Alkollü içecek";
  }

  if (found.size > 0) {
    return {
      allergens: Array.from(found),
      presetId,
      reason: reason || "İçerik analizinden tespit edildi",
      isNaturallyAllergenFree: false,
    };
  }

  // Check if naturally allergen-free (water, pure tea, black coffee, soda, fresh fruit, soft drinks)
  const isNaturallyFree =
    /su\b|soda|pellegrino|türk çayi|türk kahvesi|espresso|americano|filtre kahve|bitki çay|poşet çay|meyve suyu|limonata|coca cola|sprite|fanta|ice tea|britvic|enerji içeceği|şalgam|meyve tabaği|smoothie|frozen|nargile|shisha/.test(
      hay,
    );

  return {
    allergens: [],
    reason: isNaturallyFree
      ? "Saf içecek / meyve / nargile (Doğal olarak zorunlu alerjen içermez)"
      : "Otomatik alerjen tespit edilmedi — şablondan seçebilirsiniz",
    isNaturallyAllergenFree: isNaturallyFree,
  };
}

/**
 * 140 karakteri aşan menü açıklamalarını anlam bütünlüğünü koruyarak (cümle veya virgülden)
 * okunabilir 1-2 satıra (<= 135 karakter) kısaltır.
 */
export function shortenMenuDetail(detail: string, maxLen = 135): string {
  const cleaned = detail
    .replace(/\\+'/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;

  // Remove redundant "(Seçenekler: ...)" or "(Opsiyonlar: ...)" suffixes first if that brings it under limit
  const withoutOptions = cleaned.replace(/\s*\((?:Seçenekler|Opsiyonlar|Porsiyon):[^)]*\)\s*$/i, "").trim();
  if (withoutOptions.length > 15 && withoutOptions.length <= maxLen) {
    return withoutOptions;
  }

  const base = withoutOptions.length >= 40 ? withoutOptions : cleaned;
  const slice = base.slice(0, maxLen);

  // Prefer cutting at sentence boundary "." or ";" or ","
  const lastPeriod = slice.lastIndexOf(".");
  if (lastPeriod >= 55) {
    return slice.slice(0, lastPeriod + 1).trim();
  }
  const lastComma = Math.max(slice.lastIndexOf(","), slice.lastIndexOf("·"), slice.lastIndexOf(";"));
  if (lastComma >= 55) {
    return slice.slice(0, lastComma).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= 40) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}
