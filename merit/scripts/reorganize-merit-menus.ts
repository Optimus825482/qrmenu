import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inferAllergensForItem, shortenMenuDetail } from "../src/modules/menu/allergens";

interface MenuItem {
  catPath: string[];
  name: string;
  detail: string | null;
  price: number | null;
  imageUrl: string | null;
  allergens: string[];
  tags: string[];
}

interface OutletSeed {
  hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
  outletName: string | null;
  isRoomService: boolean;
  items: MenuItem[];
}

interface Dataset {
  version: number;
  outlets: OutletSeed[];
}

const DATA_FILE = path.join(import.meta.dirname, "..", "prisma", "seed", "data", "merit-menus.json");
const rawData = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Dataset;

// 1. Exact name fixes & typo corrections
const EXACT_NAME_FIXES: Record<string, string> = {
  "Dıamond Specıal": "Diamond Special Nargile",
  "Diamond Special": "Diamond Special Nargile",
  "Park Specıal": "Park Special Nargile",
  "Park Special": "Park Special Nargile",
  "Crystal Specıal": "Crystal Special Nargile",
  "Crystal Special": "Crystal Special Nargile",
  "Royal Specıal": "Royal Special Nargile",
  "Royal Special": "Royal Special Nargile",
  "Arap Geceleri": "Arap Geceleri Nargile",
  "Love Magıc": "Love Magic",
  "Cappuccıno": "Cappuccino Nargile",
  "Fresh Mıx": "Fresh Mix",
  "Tıramısu": "Tiramisu Nargile",
  "Plombır": "Plombir",
  "Master Mıx": "Master Mix",
  "Pızza Chıcken Calzone": "Pizza Chicken Calzone",
  "Pızza Margarita": "Pizza Margherita",
  "Pızza Formaggi": "Pizza Quattro Formaggi",
  "PIZZA FOURSTEGION": "Pizza Quattro Stagioni",
  "PIZZA FORMAGGI": "Pizza Quattro Formaggi",
  "PIZZA BURRATA": "Pizza Burrata",
  "PIZZA MARGHERITA": "Pizza Margherita",
  "PIZZA FRUTTI DI MARE": "Pizza Frutti di Mare",
  "PIZZA COSTOLA": "Pizza Costola",
  "PIZZA BISTECCA": "Pizza Bistecca",
  "SPAHGETTI AL POMODORO": "Spaghetti al Pomodoro",
  "SPAGETTHI AL BOLOGNESE": "Spaghetti alla Bolognese",
  "SPAGETTHI DI MARE": "Spaghetti ai Frutti di Mare",
  "PASTA CARBONARO": "Spaghetti alla Carbonara",
  "PARPADELLA AL RAGU": "Pappardelle al Ragù",
  "PASTA A FORMA DI FAZZOLETTO CON SALSA AL PESTO": "Fazzoletti al Pesto Genovese",
  "AGNOLOTTI RIPIENI DI SPINACI E FORMAGGIO": "Agnolotti Ispanak & Ricotta",
  "RISOTTO AI FRUTTI DI MARE": "Risotto ai Frutti di Mare",
  "RISOTTO AI FUNGHI SELVATICI": "Risotto ai Funghi Selvatici",
  "RAVIOLI AI FUNGHI": "Ravioli ai Funghi Porcini",
  "GNOCCHI AL FORMAGGIO": "Gnocchi ai Quattro Formaggi",
  "TAGLIOLINI TARTUFO": "Tagliolini al Tartufo",
  "LAZANYA": "Lasagna Tradizionale",
  "CARNE CRUDO ALL’ALBESE": "Carne Cruda all’Albese",
  "BRESAOLA CON CAPRINO FRESCO E RUCOLA": "Bresaola, Keçi Peyniri & Roka",
  "VITELLO TONNATO": "Vitello Tonnato",
  "FANTASIA DI BURRATA": "Fantasia di Burrata",
  "CARPACCIO DI MANZO": "Carpaccio di Manzo",
  "CARCIOFI E FINOCCHI AL SALMORIGLIO": "Enginar & Rezene Salmoriglio",
  "CODE DI GAMBERI": "Code di Gamberi (Kral Karides)",
  "POLPO": "Polpo alla Griglia (Izgara Ahtapot)",
  "ARANCINI": "Arancini Siciliani",
  "MELANZANE ALLA PARMIGIANA": "Melanzane alla Parmigiana",
  "CALAMARI CON SALSA AL CACIO PEPE": "Calamari Cacio e Pepe",
  "INSALATE DI MARE": "Insalata di Mare",
  "INSALATA MEDITERRANEA": "Insalata Mediterranea",
  "CARCIOFI AVOKADO": "Enginarlı & Avokadolu Salata",
  "ACILI DENİZ ÜRÜNLERİ ÇORBASI": "Acılı Deniz Ürünleri Çorbası",
  "MINESTRONE SOUP": "Minestrone Sebze Çorbası",
  "GUANCIA DI VITELLO": "Guancia di Vitello (Dana Yanağı)",
  "OSSO BUCCO": "Osso Buco alla Milanese",
  "FILLET DE MANZO": "Filetto di Manzo",
  "RIB-EYE": "Rib-Eye alla Griglia",
  "COTOLETTE AGNELLO": "Costolette d’Agnello (Kuzu Pirzola)",
  "OMBRINA": "Ombrina Fileto (Minekop)",
  "SOGLIOLA INTERA ALLA MUGNAIA": "Sogliola alla Mugnaia (Dil Balığı)",
  "CERNIA": "Cernia (Izgara Lagos)",
  "IL DELIZIOSO GELATO ROYAL'S": "Il Delizioso Gelato Royal's",
  "IL DELIZIOSO GELATO ROYAL\\'S": "Il Delizioso Gelato Royal's",
  "STRUDEL DI MELE": "Strudel di Mele (Elmalı Strudel)",
  "ZABAIONE": "Zabaione al Marsala",
  "CANNELLONI": "Cannoli Siciliani",
  "PANNA COTTA": "Panna Cotta ai Frutti di Bosco",
  "SORBE": "Sorbetto al Limone",
  "TIRAMISU": "Tiramisù Classico",
  "Kıymalı Pİde": "Kıymalı Pide",
  "Sarımsaklı Terayağlı Ekmek": "Sarımsaklı Tereyağlı Ekmek",
  "Kınoa Tabulleh": "Kinoalı Tabule Salatası",
  "KLASİK CHEESEBURGER": "Klasik Cheeseburger",
  "RONAFELD POŞET ÇAYLAR": "Ronnefeldt Poşet Çay Seçkisi",
  "GREEN ANGLE": "Ronnefeldt Green Angel",
  "Lombardo Bianco D'Altura": "Lombardo Bianco d'Altura",
  "Lombardo Bianco D\\'Altura": "Lombardo Bianco d'Altura",
  "Lombardo Bianco D\\\\\\'Altura": "Lombardo Bianco d'Altura",
  "Lombardo Nero D'Altura 2022": "Lombardo Nero d'Altura 2022",
  "Lombardo Nero D\\'Altura 2022": "Lombardo Nero d'Altura 2022",
  "Fınca Ayles Unexpected Garnacha 2023": "Finca Ayles Unexpected Garnacha 2023",
  "Fınca Ayles Unexpected Chardonay 2024": "Finca Ayles Unexpected Chardonnay 2024",
  "Cloudy Bay Chardonay 2023": "Cloudy Bay Chardonnay 2023",
  "Sarafin Chardonay 2023": "Sarafin Chardonnay 2023",
  "Günün Çorbası (Servis Personeline sorunuz)": "Günün Şef Çorbası",
  "FRESH MEYVE SUYU (Mevsimine göre değişiklik gösterebilir)": "Taze Sıkma Mevsim Meyve Suyu",
  "Pekin Ördeği *Yarım 1200 gr./ Tam 2400 gr.": "Kraliyet Pekin Ördeği",
  "Izgara Langustin (2/4 4/7 7/8 8/12)": "Izgara Langustin (Deniz Kereviti)",
  "Karides Izgara (2/4 4/6 6/8 8/12 13/15 16/20)": "Izgara Jumbo Karides",
  "Alasya Denizinde Telde Balık (400 gr Levrek Balığı)": "Alasya Usulü Telde Kaya Levreği",
  "İNCİ": "İnci Gün Batımı Rakı & Meze Seti",
  "2 TEK": "İki Tek Gün Batımı Rakı & Meze Seti",
  "Auburgine Char": "Köz Patlıcan & Tahin (Aubergine Char)",
  "Straciatella Köpüğü": "Stracciatella Köpüğü & İncir",
  "Milli-Feuille": "Mille-Feuille (Milföy Pasta)",
  "Penne Arabiata": "Penne All’Arrabbiata",
  "Penne Arabiatta": "Penne All’Arrabbiata",
  "Penne All’arrabiata": "Penne All’Arrabbiata",
  "Fettucine Alfredo": "Fettuccine Alfredo",
  "Spagetti Bolenez": "Spagetti Bolonez",
  "Fusili Al Pesto": "Fusilli al Pesto",
  "Mantar soslu Tagliatelli": "Mantar Soslu Tagliatelle",
  "Piliç Şinitsel": "Tavuk Şinitzel",
  "SAN PELLEGRINO": "San Pellegrino",
  "YAPRAK ANTRIKOT": "Yaprak Antrikot",
  "CAFE DE PARİS SOSLU BONFİLE": "Café de Paris Soslu Bonfile",
  "CAFE DE PARİS SOS": "Café de Paris Sos",
  "T-BONE STEAK": "T-Bone Steak",
  "CHATEAUBRIAND (4 Kişi)": "Chateaubriand (4 Kişilik)",
  "CHATEAUBRIAND (2 Kişi)": "Chateaubriand (2 Kişilik)",
  "SU CAM 330 ML.": "Su Cam 330 ml",
  "Su Cam 330 ml": "Su Cam 330 ml",
  "CAM SU": "Su Cam 330 ml",
};

const PRESERVE_UPPER = new Set([
  "V60",
  "V.S.",
  "V.S.O.P.",
  "X.O.",
  "Y.O.",
  "US",
  "NO:7",
  "NO:10",
  "NO:27",
  "NO",
  "DE",
  "DI",
  "DU",
  "LA",
  "LE",
  "EL",
  "AL",
  "II",
  "III",
  "IV",
  "V",
  "XIII",
  "VX",
  "G.H",
  "ML",
  "ML.",
  "GR",
  "GR.",
  "VIP",
]);

function smartTitleCase(raw: string): string {
  const cleaned = raw.replace(/\\+'/g, "'").replace(/\s+/g, " ").trim();
  if (EXACT_NAME_FIXES[cleaned]) return EXACT_NAME_FIXES[cleaned];
  if (EXACT_NAME_FIXES[raw]) return EXACT_NAME_FIXES[raw];

  // If the string already has lowercase letters (mixed case), just fix isolated Turkish I/ı typos
  const hasLower = /[a-zçğıöşü]/.test(cleaned);
  if (hasLower) {
    return cleaned
      .replace(/\bDıamond\b/g, "Diamond")
      .replace(/\bSpecıal\b/g, "Special")
      .replace(/\bMagıc\b/g, "Magic")
      .replace(/\bMıx\b/g, "Mix")
      .replace(/\bTıramısu\b/g, "Tiramisu")
      .replace(/\bPlombır\b/g, "Plombir");
  }

  // Convert ALL CAPS to clean Title Case
  return cleaned
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (PRESERVE_UPPER.has(word)) return word;
      if (/^\d+$/.test(word)) return word;
      const lower = word.toLocaleLowerCase("tr");
      if (lower === "ve" || lower === "ile" || lower === "&") return lower;
      // Handle English brand names that contain "I" so it doesn't turn into "ı" when appropriate
      const isEnglishBrand =
        /^(SINGLE|DOUBLE|ESPRESSO|CAPPUCCINO|LATTE|MACCHIATO|AMERICANO|WHITE|COFFEE|ICE|ICED|MATCHA|FRAPPE|FRAPPUCCINO|COLD|BREW|AFFOGATO|SMOOTHIE|MILKSHAKE|MILKSHAKES|SPRITE|BRITVIC|MARTINI|CAMPARI|APEROL|LIMONCELLO|LEMONCELLO|WHISKEY|WHISKY|SINGLETON|GLENFIDDICH|GLENLIVET|GLENMORANGIE|GLENKINCHIE|MACALLAN|BALVENIE|LAGAVULIN|TALISKER|DALWHINNIE|HIGHLAND|BENRIACH|BENRIARCH|LAPHROAIG|BOWMORE|CHIVAS|JOHNNIE|KING|SWING|DIMPLE|FAMOUS|BALLANTINES|JUSTERINI|BUSHMILLS|JAMESON|JIM|JACK|DANIELS|GENTLEMAN|WOODFORD|BULLEIT|MAKERS|ELIJAH|BASIL|KNOB|HIBIKI|YAMAZAKI|KAVALAN|CANADIAN|DISTILLERY|DISTTILLERY|HENNESSY|COURVOISIER|REMY|MARTIN|PRIME|LOUIS|MARTELL|METAXA|MILAGRO|SILVER|TEQUILA|PATRON|JULIO|HERRADURA|CLASE|CLASSE|BACARDI|CAPTAIN|WHITE|SPICED|CARIBBEAN|MALIBU|SMIRNOFF|ABSOLUT|VANILLA|CITRON|MANDARIN|ELYX|RUSSIAN|CIROC|BELVEDERE|TITOS|HAKU|SUICIDE|CRYSTAL|BEEFEATER|PINK|BOMBAY|SAPPHIRE|GORDONS|HENDRICKS|TANQUERAY|CLASSIC|BOTANIST|MALFY|GRAPEFRUIT|FRANGELICO|GERMAIN|BENEDICTINE|BENETICTINE|GALLIANO|SHERIDANS|SHERIDAN'S|DRAMBUIE|PIMMS|PISANG|COINTREAU|SKINOSS|BATI|ARCHERS|ARCHER'S|SAFARI|MARNIER|JAGERMEISTER|BRANCA|TIA|MARIA|AMARETTO|DISARONNO|ORIGINALE|BAILEYS|IRISH|CREAM|CARDINAL|SOUTHERN|APRICOT|BRANDY|HEINEKEN|MILLER|MİLLER|BECKS|BECK'S|STELLA|ARTOIS|PILSEN|PİLSEN|ROOIBOS|ENGLISH|BREAKFAST|WINTERDREAM|AYURVEDA|GINGER|CHOCOLATE|YIN|TWIST|CHINESE|SPRING|GREENLEAF|JASMINE|HUCKLEBERRY|FRIEND|REFRESHING|MINT|FRUITY|CAMOMILE|MASALA|CHAI|MORGENTAU|OLD|FASHIONED|NEGRONI|SOUR|SPRITZ|DAIQUIRI|MOJITO|MARGARITA|LONG|ISLAND|TEA|COSMOPOLITAN|CAIPIRINHA|BLOODY|MARY|BELLINI|FRENCH|ILLUSION|PASSION|HARMONY|RIBEYE|STEAK|SIRLOIN|CITY|KANSAS|BONE-IN|TOMAHAWK|CHATEAUBRIAND|DALLAS|T-BONE|TRIO|DIAMOND)$/.test(
          word,
        );
      const cased = isEnglishBrand ? word.toLowerCase() : lower;
      const first = cased.charAt(0);
      const capFirst = isEnglishBrand ? first.toUpperCase() : first.toLocaleUpperCase("tr");
      return capFirst + cased.slice(1);
    })
    .join(" ");
}

// 2. Concise, appetizing fallback descriptions for items that lacked a description
function generateConciseDetail(name: string, catPath: string[], existingDetail: string | null): string {
  if (existingDetail && existingDetail.trim().length > 0) {
    const fixed = existingDetail
      .replace(/\\+'/g, "'")
      .replace(/Englısh/gi, "English")
      .replace(/mınt/gi, "mint")
      .replace(/Rooıbos/gi, "Rooibos")
      .replace(/gçvdeli/gi, "gövdeli")
      .replace(/tananler/gi, "tanenler")
      .replace(/\s+/g, " ")
      .trim();
    return shortenMenuDetail(fixed, 132);
  }

  const hay = `${catPath.join(" ")} ${name}`.toLocaleLowerCase("tr").replace(/ı/g, "i");

  if (/nargile|shisha/.test(hay)) {
    if (/alkollü/.test(hay)) return "Özel şişesinde seçkin distile içki aromasıyla hazırlanan VIP nargile deneyimi.";
    if (/taze mevsim meyvesi/.test(hay)) return "Taze oyulmuş mevsim meyvesi çanağında hazırlanan özel nargile sunumu.";
    if (/special|arap geceleri|kibris geceleri|love magic|master mix|fresh mix|ejavu|ejoy/.test(hay)) {
      return "Merit nargile ustalarının egzotik meyve ve ferahlatıcı aromalarla hazırladığı imza harman.";
    }
    return `Seçkin tütün yaprakları ve doğal ${name.toLocaleLowerCase("tr")} aromasıyla hazırlanan geleneksel nargile.`;
  }
  if (/wagyu|kobe/.test(hay)) return "Yüksek mermerimsi yağ dokusuna sahip, ağızda dağılan A5 kalite Japon Wagyu kesimi.";
  if (/us cut|imperial gold/.test(hay)) return "28 gün Dry-Aged dinlendirilmiş, yüksek mermerli US Prime özel antrikot/bonfile kesimi.";
  if (/tomahawk|dallas|t-bone|porterhouse|chateaubriand|kansas/.test(hay)) {
    return "Dry-Aged dolaplarımızda dinlendirilmiş, meşe odunu ateşinde mühürlenen imza steak kesimi.";
  }
  if (/kuzu/.test(hay)) return "Taze biberiye ve kekik marinasyonuyla ağır ateşte veya ızgarada pişirilen seçkin Trakya kuzusu.";
  if (/sashimi/.test(hay)) return "Taze zencefil turşusu, wasabi ve soya sosu eşliğinde 3 dilim şef kesimi taze balık.";
  if (/nigiri|gunkan/.test(hay)) return "Özel sirkeli suşi pirinci üzerinde 3 adet taze şef kesimi deniz mahsulü.";
  if (/maki|roll/.test(hay)) return "Taze deniz mahsulleri, avokado ve özel şef soslarıyla hazırlanan imza suşi roll.";
  if (/pekin ördeği|ördek/.test(hay)) return "Geleneksel el açması krepler, taze soğan, salatalık ve özel Hoisin sos eşliğinde.";
  if (/noodle/.test(hay)) return "Yüksek ateşte wok tavada taze sebzeler ve özel soya sosuyla sotelenmiş el yapımı erişte.";
  if (/pilav/.test(hay)) return "Wok tavada taze malzemeler ve aromatik Asya baharatlarıyla hazırlanmış buharda yasemin pirinci.";
  if (/çorba|soup|zuppe/.test(hay)) return "Şefin günlük taze malzemeler ve aromatik otlarla hazırladığı sıcak başlangıç çorbası.";
  if (/meze|zeytinyağli|tarator|haydari|humus|fava|ezme|cacik|şakşuka|mütebbel|babagannuş|hibeş|lakerda|çiroz|marin|ceviche|gravlax/.test(hay)) {
    return "Soğuk sıkım sızma zeytinyağı ve taze Ege otlarıyla günlük hazırlanan imza soğuk meze.";
  }
  if (/istakoz|langustin|karides|kalamar|ahtapot/.test(hay)) {
    return "Zeytinyağı, taze limon ve Akdeniz otlarıyla hazırlanan günlük taze deniz mahsulü.";
  }
  if (/levrek|çipura|somon|lago|cernia|ombrina|sogliola|balik/.test(hay)) {
    return "Mevsim yeşillikleri ve zeytinyağlı limon sos eşliğinde ızgara veya tava taze deniz balığı.";
  }
  if (/pizza/.test(hay)) return "Taş fırında İtalyan unu, taze mozzarella ve san marzano domates sosuyla pişirilen artisan pizza.";
  if (/pide|gözleme/.test(hay)) return "Taş fırında veya sac üzerinde günlük taze iç harcıyla hazırlanan geleneksel lezzet.";
  if (/risotto|spaghetti|penne|fettuccine|tagliolini|tagliatelle|ravioli|agnolotti|gnocchi|pappardelle|lazanya|lasagna|makarna|manti/.test(hay)) {
    return "Taze otlar, yıllanmış parmesan ve şefin özel sosuyla hazırlanan el yapımı makarna/risotto.";
  }
  if (/burger|sandviç|sandwich|tost|sando/.test(hay)) {
    return "Artisan ekmek arasında taze malzemeler ve baharatlı patates kızartması eşliğinde.";
  }
  if (/salata|insalata|insalate/.test(hay)) {
    return "Bahçeden taze akdeniz yeşillikleri ve sızma zeytinyağlı özel sos ile.";
  }
  if (/baklava|sütlaç|kazandibi|cheesecake|tiramisu|panna cotta|profiterol|browni|magnolia|waffle|pancake|krep|strudel|zabaione|cannoli|crème brûlée|paris brest|mille-feuille|gianduja|kek|cake|sufle|soufle/.test(hay)) {
    return "Merit pastanesinde günlük taze malzemeler ve Belçika çikolatası/meyvelerle hazırlanan tatlı.";
  }
  if (/dondurma|gelato|sorbe|banana split/.test(hay)) {
    return "Günlük taze süt ve doğal meyve özleriyle hazırlanan serinletici artisan dondurma.";
  }
  if (/meyve/.test(hay)) return "Mevsimin en taze seçkin meyvelerinden hazırlanan ferahlatıcı sunum.";
  if (/single malt|malt viski|iskoç|irlanda|bourbon|tennessee|dünya viski|whisky|whiskey/.test(hay)) {
    return "Meşe fıçılarda yıllandırılmış, zengin aromalı seçkin viski (4 cl).";
  }
  if (/konyak|cognac|hennessy|remy martin|martell|courvoisier|metaxa|napoleon/.test(hay)) {
    return "Fransız meşe fıçılarında yıllandırılmış seçkin konyak & brandy (4 cl).";
  }
  if (/kokteyl|mojito|margarita|negroni|martini|spritz|sour|old fashioned|cosmopolitan|caipirinha|daiquiri|bellini/.test(hay)) {
    return "Taze narenciye, el yapımı şuruplar ve premium distile içkilerle hazırlanan miksoloji kokteyli.";
  }
  if (/votka|vodka|cin\b|gin\b|tekila|tequila|rom\b|rum\b|likör|aperatif/.test(hay)) {
    return "Buz veya tercih edeceğiniz mikser eşliğinde servis edilen seçkin distile içki (4 cl).";
  }
  if (/bira|efes|heineken|corona|miller|carlsberg|tuborg|beck|stella|bud/.test(hay)) {
    return "Soğuk servis edilen ferahlatıcı arpa maltı birası (33 cl).";
  }
  if (/ronnefeldt|bitki çay|demleme çay|yeşil çay|soğuk çay|matcha/.test(hay)) {
    return "Doğal çay yaprakları ve aromatik bitkilerle demlenen seçkin çay sunumu.";
  }
  if (/kahve|espresso|americano|latte|cappuccino|macchiato|cortado|flat white|v60|chemex|syphon|cold brew|frappe|frappuccino|affogato/.test(hay)) {
    return "100% Arabica kahve çekirdeklerinden taze çekilerek barista tarafından hazırlanan kahve.";
  }
  if (/limonata|frozen|smoothie|milkshake|meyve suyu/.test(hay)) {
    return "Taze mevsim meyveleri ve buz ile hazırlanan ferahlatıcı soğuk içecek.";
  }
  if (/su\b|soda|pellegrino|coca cola|sprite|fanta|ice tea|britvic|enerji|ayran|şalgam/.test(hay)) {
    return "Soğuk servis edilen ferahlatıcı meşrubat / doğal kaynak suyu.";
  }
  return "Merit mutfak ve bar ekibinin seçkin malzemelerle hazırladığı özel sunum.";
}

// 3. Build a clean master pool of items we can draw from when enriching Cafes, Lounges, Wine House, etc.
const itemPoolByName = new Map<string, MenuItem>();
for (const outlet of rawData.outlets) {
  for (const item of outlet.items) {
    const cleanName = smartTitleCase(item.name);
    if (cleanName === "Sipariş Oluşturun" || item.name === "SİPARİŞ OLUŞTURUN") continue;
    if (!itemPoolByName.has(cleanName) || (!itemPoolByName.get(cleanName)?.price && item.price)) {
      itemPoolByName.set(cleanName, {
        ...item,
        name: cleanName,
      });
    }
  }
}

function getPoolItem(name: string, catPath: string[], fallbackPrice = 20): MenuItem | null {
  const clean = smartTitleCase(name);
  const found = itemPoolByName.get(clean) ?? itemPoolByName.get(name);
  if (!found) return null;
  return {
    ...found,
    catPath,
    name: clean,
    price: found.price ?? fallbackPrice,
  };
}

// 4. Category + Subcategory mapping rules per Outlet Type!
function mapCategoryAndOrder(
  outletKey: string,
  item: MenuItem,
): { catPath: [string, string]; catRank: number; subRank: number } | null {
  const rawName = item.name.trim();
  if (rawName === "SİPARİŞ OLUŞTURUN" || rawName === "Damak Hoşluğu") return null;

  const oldPath = item.catPath.join(" > ").toLocaleUpperCase("tr");
  const nameUp = rawName.toLocaleUpperCase("tr");

  // Helper for common beverage categories across outlets
  const mapBeverage = (baseRank: number): { catPath: [string, string]; catRank: number; subRank: number } | null => {
    if (oldPath.includes("İMZA KOKTEYL") || oldPath.includes("İMZA KOKTEYL")) {
      return { catPath: ["Kokteyller & Miksoloji", "Merit İmza Kokteylleri"], catRank: baseRank, subRank: 1 };
    }
    if (oldPath.includes("ULUSLARARASI KOKTEYL")) {
      return { catPath: ["Kokteyller & Miksoloji", "Dünya Klasik Kokteylleri"], catRank: baseRank, subRank: 2 };
    }
    if (oldPath.includes("ŞARAP") || oldPath.includes("ŞAMPANYA")) {
      if (oldPath.includes("SOMMELIER")) {
        return { catPath: ["Sommelier Şarap & Şampanya Kavı", "Sommelier Grand Cru Seçkisi"], catRank: baseRank + 1, subRank: 1 };
      }
      if (oldPath.includes("KÖPÜKLÜ") || oldPath.includes("ŞAMPANYA")) {
        return { catPath: ["Sommelier Şarap & Şampanya Kavı", "Şampanya & Prosecco Seçkisi"], catRank: baseRank + 1, subRank: 2 };
      }
      if (oldPath.includes("KIRMIZI")) {
        const country = item.catPath[item.catPath.length - 1];
        const sub =
          country === "FRANSA" || country === "İTALYA"
            ? "Fransa & İtalya Kırmızı Şarapları"
            : country === "TÜRKİYE"
              ? "Türkiye Seçkin Kırmızı Şarapları"
              : "İspanya & Yeni Dünya Kırmızı Şarapları";
        return { catPath: ["Sommelier Şarap & Şampanya Kavı", sub], catRank: baseRank + 1, subRank: 3 };
      }
      if (oldPath.includes("BEYAZ")) {
        const country = item.catPath[item.catPath.length - 1];
        const sub =
          country === "FRANSA" || country === "İTALYA"
            ? "Fransa & İtalya Beyaz Şarapları"
            : "Dünya & Türkiye Beyaz Şarapları";
        return { catPath: ["Sommelier Şarap & Şampanya Kavı", sub], catRank: baseRank + 1, subRank: 4 };
      }
      if (oldPath.includes("ROZE")) {
        return { catPath: ["Sommelier Şarap & Şampanya Kavı", "Provence & Dünya Roze Şarapları"], catRank: baseRank + 1, subRank: 5 };
      }
      return { catPath: ["Sommelier Şarap & Şampanya Kavı", "Porto, Sherry & Tatlı Şaraplar"], catRank: baseRank + 1, subRank: 6 };
    }
    if (oldPath.includes("VİSKİ")) {
      if (oldPath.includes("MALT")) {
        return { catPath: ["Viski & Konyak Koleksiyonu", "Single Malt Viskiler"], catRank: baseRank + 2, subRank: 1 };
      }
      if (oldPath.includes("İSKOÇ")) {
        return { catPath: ["Viski & Konyak Koleksiyonu", "İskoç Harman Viskiler"], catRank: baseRank + 2, subRank: 2 };
      }
      if (oldPath.includes("BOURBON")) {
        return { catPath: ["Viski & Konyak Koleksiyonu", "Bourbon & Tennessee Viskiler"], catRank: baseRank + 2, subRank: 3 };
      }
      if (oldPath.includes("DÜNYA")) {
        return { catPath: ["Viski & Konyak Koleksiyonu", "Japon & Dünya Viskileri"], catRank: baseRank + 2, subRank: 4 };
      }
      return { catPath: ["Viski & Konyak Koleksiyonu", "İrlanda Viskileri"], catRank: baseRank + 2, subRank: 5 };
    }
    if (oldPath.includes("KONYAK")) {
      return { catPath: ["Viski & Konyak Koleksiyonu", "Konyak & Brandy Seçkisi"], catRank: baseRank + 2, subRank: 6 };
    }
    if (oldPath.includes("VOTKA")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Premium Votkalar"], catRank: baseRank + 3, subRank: 1 };
    }
    if (oldPath.includes("CİN")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Artisan Cinler"], catRank: baseRank + 3, subRank: 2 };
    }
    if (oldPath.includes("TEKİLA")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Tekila & Agave Seçkisi"], catRank: baseRank + 3, subRank: 3 };
    }
    if (oldPath.includes("ROM")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Karayip Romları"], catRank: baseRank + 3, subRank: 4 };
    }
    if (oldPath.includes("APERATİF")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Aperatifler & Vermutlar"], catRank: baseRank + 3, subRank: 5 };
    }
    if (oldPath.includes("LİKÖR")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Dünya Likörleri & Digestifler"], catRank: baseRank + 3, subRank: 6 };
    }
    if (oldPath.includes("BİRA")) {
      return { catPath: ["Distile İçkiler, Likör & Bira", "Yerli & İthal Biralar"], catRank: baseRank + 3, subRank: 7 };
    }
    if (oldPath.includes("SOĞUK KAHVE")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Buzlu Kahveler & Cold Brew"], catRank: baseRank + 4, subRank: 1 };
    }
    if (oldPath.includes("SERİNLETİCİ SOĞUK")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Smoothie, Milkshake & Frozen"], catRank: baseRank + 4, subRank: 2 };
    }
    if (oldPath.includes("EV YAPIMI SOĞUK ÇAY")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Ev Yapımı Buzlu Çaylar"], catRank: baseRank + 4, subRank: 3 };
    }
    if (oldPath.includes("MEŞRUBAT")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Soğuk Meşrubatlar & Doğal Sular"], catRank: baseRank + 4, subRank: 4 };
    }
    if (oldPath.includes("SICAK İÇECEK")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Artisan Kahveler & Sıcak İçecekler"], catRank: baseRank + 4, subRank: 5 };
    }
    if (oldPath.includes("RONNEFELDT")) {
      return { catPath: ["Sıcak & Soğuk İçecekler", "Ronnefeldt Dünya & Bitki Çayları"], catRank: baseRank + 4, subRank: 6 };
    }
    return null;
  };

  // CASE A: ODA SERVİSİ
  if (outletKey === "ROOM_SERVICE") {
    if (oldPath.includes("KAHVALTI SEÇENEKLERİ")) {
      return { catPath: ["Kahvaltı & Sabah Seçkisi", "Kahvaltı Tabakları"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("KAHVALTIYA İLAVE")) {
      return { catPath: ["Kahvaltı & Sabah Seçkisi", "Sıcak Kahvaltılıklar & Yumurta"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("HAFİF SABAH")) {
      return { catPath: ["Kahvaltı & Sabah Seçkisi", "Sağlıklı Sabah Kaseleri"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("TOSTLAR")) {
      if (/WAFFLE|PANCAKE|KREP/i.test(nameUp)) {
        return { catPath: ["Tatlılar, Waffle & Meyveler", "Waffle, Pankek & Krep"], catRank: 5, subRank: 2 };
      }
      return { catPath: ["Kahvaltı & Sabah Seçkisi", "Sıcak Tost Seçkisi"], catRank: 1, subRank: 4 };
    }
    if (oldPath.includes("ÇORBA")) {
      return { catPath: ["Çorbalar, Başlangıçlar & Salatalar", "Günün Çorbaları"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("BAŞLANGIÇ")) {
      return { catPath: ["Çorbalar, Başlangıçlar & Salatalar", "Soğuk & Sıcak Başlangıçlar"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("SALATA")) {
      return { catPath: ["Çorbalar, Başlangıçlar & Salatalar", "Taze Bahçe Salataları"], catRank: 2, subRank: 3 };
    }
    if (oldPath.includes("SANDVİÇ & BURGER")) {
      return { catPath: ["Burger, Sandviç & Makarnalar", "Gurme Burger & Kulüp Sandviçler"], catRank: 3, subRank: 1 };
    }
    if (oldPath.includes("MAKARNA & RİSOTTO")) {
      return { catPath: ["Burger, Sandviç & Makarnalar", "El Yapımı Makarna, Mantı & Risotto"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("ANA YEMEK")) {
      if (/KARİDES|LEVREK|SOMON|BALIK/i.test(nameUp)) {
        return { catPath: ["Ana Yemekler & Izgaralar", "Denizden Ana Yemekler"], catRank: 4, subRank: 2 };
      }
      return { catPath: ["Ana Yemekler & Izgaralar", "Et & Tavuk Spesiyalleri"], catRank: 4, subRank: 1 };
    }
    if (oldPath.includes("TATLILAR")) {
      if (/MEYVE/i.test(nameUp)) {
        return { catPath: ["Tatlılar, Waffle & Meyveler", "Taze Mevsim & Orman Meyveleri"], catRank: 5, subRank: 3 };
      }
      return { catPath: ["Tatlılar, Waffle & Meyveler", "Pastane & Geleneksel Tatlılar"], catRank: 5, subRank: 1 };
    }
    return mapBeverage(6);
  }

  // CASE B: LOBBY LOUNGES
  if (outletKey === "LOBBY_LOUNGE") {
    // Drop indoor Nargile from Lobby Lounges!
    if (oldPath.includes("NARGİLE")) return null;
    if (oldPath.includes("LOUNGE_FOOD_SANDWICH")) {
      return { catPath: ["Lounge Atıştırmalıkları & Patisserie", "Gurme Sandviç & Peynir Tabağı"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("LOUNGE_FOOD_DESSERT")) {
      return { catPath: ["Lounge Atıştırmalıkları & Patisserie", "Artisan Patisserie & Tatlılar"], catRank: 2, subRank: 2 };
    }
    const bev = mapBeverage(1);
    if (bev) {
      // Put Cocktails first (rank 1), Lounge Bites second (rank 2), Coffee/Soft Drinks third (rank 3), Whiskies & Spirits fourth/fifth
      if (bev.catPath[0] === "Kokteyller & Miksoloji") return { ...bev, catRank: 1 };
      if (bev.catPath[0] === "Sıcak & Soğuk İçecekler") return { ...bev, catRank: 3 };
      return { ...bev, catRank: bev.catRank + 1 };
    }
    return null;
  }

  // CASE C: POOL BARS & BEACH BAR
  if (outletKey === "POOL_BEACH") {
    if (oldPath.includes("BURGER") || oldPath.includes("HAMBURGER")) {
      return { catPath: ["Burger, Sandviç & Tostlar", "Gurme Burger & Quesadilla"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("ÇORBA") || oldPath.includes("ATIŞTIRMALIK") || oldPath.includes("KIZARTMA")) {
      return { catPath: ["Havuz & Sahil Başlangıçları", "Sıcak Çıtırlar & Atıştırmalıklar"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("SALATA") || oldPath.includes("KASELER")) {
      return { catPath: ["Havuz & Sahil Başlangıçları", "Taze Akdeniz Salataları & Kaseler"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("SANDVİÇ") || oldPath.includes("TOST")) {
      return { catPath: ["Burger, Sandviç & Tostlar", "Kulüp Sandviç & Tost Seçkisi"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("PİZZA")) {
      return { catPath: ["Taş Fırın Pizza, Pide & Gözleme", "Taş Fırın Pizzalar"], catRank: 3, subRank: 1 };
    }
    if (oldPath.includes("PİDE") || oldPath.includes("GÖZLEME")) {
      return { catPath: ["Taş Fırın Pizza, Pide & Gözleme", "El Açması Gözleme & Pideler"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("MAKARNA")) {
      return { catPath: ["Makarnalar & Izgara Ana Yemekler", "Artisan Makarnalar & Mantı"], catRank: 4, subRank: 1 };
    }
    if (oldPath.includes("ANA YEMEK")) {
      return { catPath: ["Makarnalar & Izgara Ana Yemekler", "Izgara Et, Tavuk & Deniz Ürünleri"], catRank: 4, subRank: 2 };
    }
    if (oldPath.includes("GÜN BATIMI")) {
      return { catPath: ["Makarnalar & Izgara Ana Yemekler", "Gün Batımı Rakı & Meze Setleri"], catRank: 4, subRank: 3 };
    }
    if (oldPath.includes("TATLI") || oldPath.includes("DONDURMA")) {
      return { catPath: ["Tatlılar, Dondurma & Meyve", "Serinletici Tatlılar & Dondurma"], catRank: 5, subRank: 1 };
    }
    if (oldPath.includes("NARGİLE")) {
      if (oldPath.includes("KLASİK")) {
        return { catPath: ["Açık Hava Nargile Seçkisi", "Klasik Nargile Aromaları"], catRank: 11, subRank: 2 };
      }
      return { catPath: ["Açık Hava Nargile Seçkisi", "Merit Özel & Meyveli Nargileler"], catRank: 11, subRank: 1 };
    }
    return mapBeverage(6);
  }

  // CASE D: CAFES & PATISSERIES
  if (outletKey === "CAFE_PATISSERIE" || outletKey === "CAFE_VERDE") {
    if (oldPath.includes("NARGİLE")) {
      if (outletKey === "CAFE_PATISSERIE") return null; // No hookah in indoor French/Viennese patisserie
      if (oldPath.includes("KLASİK")) {
        return { catPath: ["Bahçe & Teras Nargile Seçkisi", "Klasik Nargile Aromaları"], catRank: 12, subRank: 2 };
      }
      return { catPath: ["Bahçe & Teras Nargile Seçkisi", "Merit Özel & Meyveli Nargileler"], catRank: 12, subRank: 1 };
    }
    if (oldPath.includes("CAFE_CAKE")) {
      return { catPath: ["Artisan Patisserie & Tatlılar", "Fransız & Viyana Pastaları"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("CAFE_CHEESECAKE")) {
      return { catPath: ["Artisan Patisserie & Tatlılar", "Cheesecake, Tiramisu & Sütlü Tatlılar"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("CAFE_WAFFLE") || oldPath.includes("ROYAL DONDURMA")) {
      return { catPath: ["Artisan Patisserie & Tatlılar", "Baklava, Waffle, Krep & Dondurma"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("CAFE_SANDWICH")) {
      return { catPath: ["Kafe Sandviçleri & Hafif Lezzetler", "Kruvasan, Sandviç & Sağlıklı Kaseler"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("SICAK İÇECEK")) {
      if (/V60|CHEMEX|SYPHON|FLAT WHITE|CORTADO|MATCHA/i.test(nameUp)) {
        return { catPath: ["Üçüncü Nesil & Klasik Sıcak Kahveler", "Üçüncü Nesil Demleme & Barista Özel"], catRank: 3, subRank: 1 };
      }
      if (/ÇAY|SALEP|ÇİKOLATA/i.test(nameUp) && !/KAHVE/i.test(nameUp)) {
        return { catPath: ["Üçüncü Nesil & Klasik Sıcak Kahveler", "Sıcak Çikolata, Salep & Klasik Çay"], catRank: 3, subRank: 3 };
      }
      return { catPath: ["Üçüncü Nesil & Klasik Sıcak Kahveler", "Espresso Bazlı & Türk Kahveleri"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("SOĞUK KAHVE")) {
      return { catPath: ["Buzlu Kahveler, Smoothie & Frozen", "Buzlu Kahveler & Cold Brew"], catRank: 4, subRank: 1 };
    }
    if (oldPath.includes("SERİNLETİCİ SOĞUK")) {
      return { catPath: ["Buzlu Kahveler, Smoothie & Frozen", "Smoothie, Milkshake & Frozen"], catRank: 4, subRank: 2 };
    }
    if (oldPath.includes("RONNEFELDT DEMLEME")) {
      return { catPath: ["Ronnefeldt Dünya Çayları & Meşrubatlar", "Ronnefeldt Yaprak Demleme Çaylar"], catRank: 5, subRank: 1 };
    }
    if (oldPath.includes("RONNEFELDT BİTKİ")) {
      return { catPath: ["Ronnefeldt Dünya Çayları & Meşrubatlar", "Ronnefeldt Bitki & Meyve İnfiuzyonları"], catRank: 5, subRank: 2 };
    }
    if (oldPath.includes("EV YAPIMI SOĞUK ÇAY")) {
      return { catPath: ["Ronnefeldt Dünya Çayları & Meşrubatlar", "Ev Yapımı Buzlu Çaylar"], catRank: 5, subRank: 3 };
    }
    if (oldPath.includes("MEŞRUBAT")) {
      return { catPath: ["Ronnefeldt Dünya Çayları & Meşrubatlar", "Soğuk Meşrubatlar & Doğal Sular"], catRank: 5, subRank: 4 };
    }
    return mapBeverage(6);
  }

  // CASE E: WHISKEY HOUSE
  if (outletKey === "WHISKEY_HOUSE") {
    if (oldPath.includes("MALT VİSKİ")) {
      if (/LAGAVULIN|ARDBEG|ARDBERG|LAPHROAIG|BOWMORE|COAL ILA|CAOL ILA|TALISKER|OBAN|JURA|HIGHLAND PARK/i.test(nameUp)) {
        return { catPath: ["Single Malt & İskoç Viski Koleksiyonu", "Islay & Ada Turbalı Single Malt Viskiler"], catRank: 1, subRank: 2 };
      }
      return { catPath: ["Single Malt & İskoç Viski Koleksiyonu", "Speyside & Highland Single Malt Viskiler"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("İSKOÇ VİSKİ")) {
      return { catPath: ["Single Malt & İskoç Viski Koleksiyonu", "Prestij & Harman İskoç Viskileri"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("DÜNYA VİSKİ")) {
      return { catPath: ["Dünya, İrlanda & Amerikan Viskileri", "Japon & Dünya Viskileri"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("BOURBON")) {
      return { catPath: ["Dünya, İrlanda & Amerikan Viskileri", "Bourbon & Tennessee Viskiler"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("İRLANDA")) {
      return { catPath: ["Dünya, İrlanda & Amerikan Viskileri", "İrlanda Viskileri"], catRank: 2, subRank: 3 };
    }
    if (oldPath.includes("WHISKEY_BITES")) {
      return { catPath: ["Viski Eşlikçileri & Gurme Atıştırmalıklar", "Peynir, Şarküteri & Gurme Eşlikçiler"], catRank: 4, subRank: 1 };
    }
    const bev = mapBeverage(3);
    if (bev) {
      if (bev.catPath[0] === "Kokteyller & Miksoloji") return { ...bev, catRank: 3 };
      return { ...bev, catRank: bev.catRank + 1 };
    }
    return null;
  }

  // CASE F: SHISHA & SUNSET TERRACE
  if (outletKey === "SHISHA_TERRACE") {
    if (oldPath.includes("NARGİLE")) {
      if (oldPath.includes("ALKOLLÜ") || oldPath.includes("TAZE MEVSİM") || oldPath.includes("MERİT")) {
        return { catPath: ["Nargile Koleksiyonu (Shisha Lounge)", "Merit Özel & VIP Meyveli Nargileler"], catRank: 1, subRank: 1 };
      }
      if (/LOVE|MASTER|FRESH|EJAVU|EJOY|KIBRIS|PLOMBIR|PLOMBİR|TIRAMISU|TİRAMİSU|CAPPUCCINO|BİSKÜVİ/i.test(nameUp)) {
        return { catPath: ["Nargile Koleksiyonu (Shisha Lounge)", "Egzotik & Gurme Nargile Karışımları"], catRank: 1, subRank: 2 };
      }
      return { catPath: ["Nargile Koleksiyonu (Shisha Lounge)", "Klasik Meyve & Ferah Aromalar"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("ŞEFİN TADIMLARI") || oldPath.includes("SOĞUK BAŞLANGIÇ")) {
      return { catPath: ["Sunset Teras Mutfağı & Sushi", "Şefin Tadımları & Soğuk Başlangıçlar"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("SUSHI") || oldPath.includes("BAR MENÜ")) {
      return { catPath: ["Sunset Teras Mutfağı & Sushi", "Sushi, Sashimi & Teras Atıştırmalıkları"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("ARA SICAK") || oldPath.includes("ÇORBA")) {
      return { catPath: ["Sunset Teras Mutfağı & Sushi", "Sıcak Başlangıçlar, Taco & Çorbalar"], catRank: 2, subRank: 3 };
    }
    if (oldPath.includes("ANA YEMEK")) {
      return { catPath: ["Sunset Teras Mutfağı & Sushi", "Teras İmza Ana Yemekler"], catRank: 2, subRank: 4 };
    }
    if (oldPath.includes("TATLI")) {
      return { catPath: ["Sunset Teras Mutfağı & Sushi", "Artisan Tatlılar & Meyve"], catRank: 2, subRank: 5 };
    }
    return mapBeverage(3);
  }

  // CASE G: THE STEAKHOUSE
  if (outletKey === "STEAKHOUSE") {
    if (oldPath.includes("BAŞLANGIÇ")) {
      return { catPath: ["Başlangıçlar, Çorba & Salatalar", "Soğuk Başlangıçlar & Steak Tartar"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("ÇORBA") || oldPath.includes("ARA SICAK")) {
      return { catPath: ["Başlangıçlar, Çorba & Salatalar", "Sıcak Başlangıçlar & İlik Çorbası"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("SALATA")) {
      return { catPath: ["Başlangıçlar, Çorba & Salatalar", "Taze Steakhouse Salataları"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("JAPANESE WAGYU") || oldPath.includes("US CUT IMPERIAL")) {
      return { catPath: ["Dry-Aged, Wagyu & Prime Steakler", "Japanese Wagyu & US Imperial Gold"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("DANA ETLERİ")) {
      if (/KOBE|TOMAHAWK|CHATEAUBRIAND|DALLAS|T-BONE|KANSAS|PİRZOLA|ASSADO/i.test(nameUp)) {
        return { catPath: ["Dry-Aged, Wagyu & Prime Steakler", "Dry-Aged Kemikli & Paylaşımlık Kesimler"], catRank: 2, subRank: 2 };
      }
      return { catPath: ["Dry-Aged, Wagyu & Prime Steakler", "Kasap Seçkisi Bonfile & Antrikot"], catRank: 2, subRank: 3 };
    }
    if (oldPath.includes("KUZU ETLERİ")) {
      return { catPath: ["Kuzu Izgaralar & Steak Burgerler", "Trakya Kuzu Özel Kesimleri"], catRank: 3, subRank: 1 };
    }
    if (oldPath.includes("KÖFTE & BURGER")) {
      return { catPath: ["Kuzu Izgaralar & Steak Burgerler", "Artisan Steak Burger & Köfteler"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("SOSLAR VE GARNİTÜRLER")) {
      if (/SOS$/i.test(rawName)) {
        return { catPath: ["Garnitürler, Soslar & Tatlılar", "İmza Steak Sosları"], catRank: 4, subRank: 2 };
      }
      return { catPath: ["Garnitürler, Soslar & Tatlılar", "Eşlikçi Sıcak Garnitürler"], catRank: 4, subRank: 1 };
    }
    if (oldPath.includes("TATLI")) {
      return { catPath: ["Garnitürler, Soslar & Tatlılar", "Tatlılar & Mevsim Meyveleri"], catRank: 4, subRank: 3 };
    }
    return mapBeverage(5);
  }

  // CASE H: DIONYSOS WINE HOUSE
  if (outletKey === "WINE_HOUSE") {
    if (oldPath.includes("WINE_PAIRING")) {
      return { catPath: ["Şarap Eşlikçileri & Peynir Seçkisi", "Artisan Peynir, Şarküteri & Tapas"], catRank: 5, subRank: 1 };
    }
    if (oldPath.includes("SOMMELIER")) {
      const country = item.catPath[item.catPath.length - 1];
      const sub = country === "FRANSA" ? "Bordeaux Grand Cru Classé (Fransa)" : "İtalyan İkonları (Super Tuscan & Barolo)";
      return { catPath: ["Sommelier Grand Cru & Prestij Seçkisi", sub], catRank: 1, subRank: country === "FRANSA" ? 1 : 2 };
    }
    if (oldPath.includes("KÖPÜKLÜ") || oldPath.includes("ŞAMPANYA")) {
      const country = item.catPath[item.catPath.length - 1];
      const sub = country === "FRANSA" ? "Fransız Şampanyaları (Champagne)" : "İtalyan Prosecco & Spumante";
      return { catPath: ["Şampanyalar & Köpüklü Şaraplar", sub], catRank: 2, subRank: country === "FRANSA" ? 1 : 2 };
    }
    if (oldPath.includes("KIRMIZI")) {
      const country = item.catPath[item.catPath.length - 1];
      if (country === "FRANSA") return { catPath: ["Kırmızı Şaraplar (Dünya & Türkiye)", "Fransa Kırmızı Şarapları (Bordeaux & Bourgogne)"], catRank: 3, subRank: 1 };
      if (country === "İTALYA") return { catPath: ["Kırmızı Şaraplar (Dünya & Türkiye)", "İtalya Kırmızı Şarapları (Toscana, Piemonte & Veneto)"], catRank: 3, subRank: 2 };
      if (country === "TÜRKİYE") return { catPath: ["Kırmızı Şaraplar (Dünya & Türkiye)", "Türkiye Seçkin Bağları"], catRank: 3, subRank: 4 };
      return { catPath: ["Kırmızı Şaraplar (Dünya & Türkiye)", "İspanya, Portekiz & Yeni Dünya (Şili, Arjantin)"], catRank: 3, subRank: 3 };
    }
    if (oldPath.includes("BEYAZ")) {
      const country = item.catPath[item.catPath.length - 1];
      if (country === "FRANSA" || country === "İTALYA") {
        return { catPath: ["Beyaz, Roze & Porto Şarapları", "Fransa & İtalya Beyaz Şarapları"], catRank: 4, subRank: 1 };
      }
      return { catPath: ["Beyaz, Roze & Porto Şarapları", "Dünya & Türkiye Beyaz Şarapları"], catRank: 4, subRank: 2 };
    }
    if (oldPath.includes("ROZE")) {
      return { catPath: ["Beyaz, Roze & Porto Şarapları", "Provence & Dünya Roze Şarapları"], catRank: 4, subRank: 3 };
    }
    return { catPath: ["Beyaz, Roze & Porto Şarapları", "Porto, Sherry & Tatlı Şaraplar"], catRank: 4, subRank: 4 };
  }

  // CASE I: BLUE SEA ALAKART
  if (outletKey === "BLUE_SEA") {
    if (oldPath.includes("MEZELER") || oldPath.includes("MEVSİMSEL")) {
      if (/ÇİROZ|MARİN|GRAVLAX|CEVICHE|LAKERDA|PAZI SARMA/i.test(nameUp)) {
        return { catPath: ["Soğuk Deniz Mezeleri & Zeytinyağlılar", "Denizden Marin, Lakerda & Ceviche"], catRank: 1, subRank: 1 };
      }
      if (/ZEYTİNYAĞLI|BÖRÜLCE|KAYA KORUĞU|KABAK ÇİÇEĞİ|EGE OTLARI|FAVA|GİRİT/i.test(nameUp)) {
        return { catPath: ["Soğuk Deniz Mezeleri & Zeytinyağlılar", "Ege Otları & Zeytinyağlılar"], catRank: 1, subRank: 2 };
      }
      return { catPath: ["Soğuk Deniz Mezeleri & Zeytinyağlılar", "Geleneksel Soğuk Mezeler"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("SOĞUK BAŞLANGIÇLAR VE SALATALAR") || oldPath.includes("ÇORBA")) {
      return { catPath: ["Çorba, Salatalar & Ara Sıcaklar", "Balıkçı Çorbası & Taze Deniz Salataları"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("ARA SICAK")) {
      return { catPath: ["Çorba, Salatalar & Ara Sıcaklar", "Sıcak Deniz Başlangıçları"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("ANA YEMEK")) {
      if (/ISTAKOZ|LANGUSTİN|AHTAPOT|KARİDES/i.test(nameUp)) {
        return { catPath: ["Denizden Ana Yemekler & Kabuklular", "Istakoz, Langustin, Ahtapot & Karides"], catRank: 3, subRank: 1 };
      }
      return { catPath: ["Denizden Ana Yemekler & Kabuklular", "Günün Taze Balıkları & Buğulama"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("TATLI")) {
      return { catPath: ["Tatlılar & Meyve Seçkisi", "Geleneksel Tatlılar & Mevsim Meyveleri"], catRank: 4, subRank: 1 };
    }
    return mapBeverage(5);
  }

  // CASE J: ROYAL MANDARIN
  if (outletKey === "ROYAL_MANDARIN") {
    if (oldPath.includes("ÇORBA")) {
      return { catPath: ["Çorbalar, Dim Sum & Başlangıçlar", "Geleneksel Asya Çorbaları"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("SOĞUK BAŞLANGIÇ")) {
      return { catPath: ["Çorbalar, Dim Sum & Başlangıçlar", "Soğuk Başlangıçlar & Tartar"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("SICAK BAŞLANGIÇ")) {
      return { catPath: ["Çorbalar, Dim Sum & Başlangıçlar", "Dim Sum, Tempura & Sıcak Başlangıçlar"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("SASHIMI")) {
      return { catPath: ["Sushi, Sashimi & Maki Bar", "Royal Sashimi Seçkisi (3 Adet)"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("NIGIRI")) {
      return { catPath: ["Sushi, Sashimi & Maki Bar", "Royal Nigiri Seçkisi (3 Adet)"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("SOFT SUSHI")) {
      return { catPath: ["Sushi, Sashimi & Maki Bar", "Signature Soft Rolls"], catRank: 2, subRank: 3 };
    }
    if (oldPath.includes("HOT SUSHI")) {
      return { catPath: ["Sushi, Sashimi & Maki Bar", "Hot & Crispy Tempura Rolls"], catRank: 2, subRank: 4 };
    }
    if (oldPath.includes("MAKI ROLL")) {
      return { catPath: ["Sushi, Sashimi & Maki Bar", "Klasik Maki Rolls (6 Adet)"], catRank: 2, subRank: 5 };
    }
    if (oldPath.includes("ÖRDEK")) {
      return { catPath: ["Pekin Ördeği & Wok Deniz Mahsulleri", "İmza Pekin Ördeği Spesiyalleri"], catRank: 3, subRank: 1 };
    }
    if (oldPath.includes("KARİDES")) {
      return { catPath: ["Pekin Ördeği & Wok Deniz Mahsulleri", "Wok Karides Spesiyalleri"], catRank: 3, subRank: 2 };
    }
    if (oldPath.includes("BALIK") || oldPath.includes("KALAMAR")) {
      return { catPath: ["Pekin Ördeği & Wok Deniz Mahsulleri", "Wok Balık & Kalamar Spesiyalleri"], catRank: 3, subRank: 3 };
    }
    if (oldPath.includes("DANA ETİ")) {
      return { catPath: ["Wok Et, Tavuk & Sebze Spesiyalleri", "Wok Dana & Kuzu Spesiyalleri"], catRank: 4, subRank: 1 };
    }
    if (oldPath.includes("TAVUK ETİ")) {
      return { catPath: ["Wok Et, Tavuk & Sebze Spesiyalleri", "Wok Tavuk Spesiyalleri"], catRank: 4, subRank: 2 };
    }
    if (oldPath.includes("VEJETERYAN")) {
      return { catPath: ["Wok Et, Tavuk & Sebze Spesiyalleri", "Wok Sebze & Tofu Seçkisi"], catRank: 4, subRank: 3 };
    }
    if (oldPath.includes("NOODLE")) {
      return { catPath: ["Noodle, Pilav & Asya Tatlıları", "El Yapımı Wok Noodle"], catRank: 5, subRank: 1 };
    }
    if (oldPath.includes("PİLAV")) {
      return { catPath: ["Noodle, Pilav & Asya Tatlıları", "Kanton Usulü Pilav Çeşitleri"], catRank: 5, subRank: 2 };
    }
    if (oldPath.includes("TATLI")) {
      return { catPath: ["Noodle, Pilav & Asya Tatlıları", "Egzotik Asya Tatlıları"], catRank: 5, subRank: 3 };
    }
    return mapBeverage(6);
  }

  // CASE K: BELLA MERIT (Italian Fine Dining)
  if (outletKey === "BELLA_MERIT") {
    if (oldPath.includes("ANTIPASTI CALDI")) {
      return { catPath: ["Antipasti, Zuppe & Insalate", "Antipasti Caldi (Sıcak Başlangıçlar)"], catRank: 1, subRank: 2 };
    }
    if (oldPath.includes("ANTIPASTI")) {
      return { catPath: ["Antipasti, Zuppe & Insalate", "Antipasti Freddi (Soğuk Başlangıçlar)"], catRank: 1, subRank: 1 };
    }
    if (oldPath.includes("ZUPPE") || oldPath.includes("INSALATE")) {
      return { catPath: ["Antipasti, Zuppe & Insalate", "Le Zuppe & Insalate (Çorba ve Salatalar)"], catRank: 1, subRank: 3 };
    }
    if (oldPath.includes("PRIMI PIATTI")) {
      return { catPath: ["Primi Piatti & Pizza Artigianale", "Primi Piatti (El Yapımı Makarna & Risotto)"], catRank: 2, subRank: 1 };
    }
    if (oldPath.includes("PIZZA")) {
      return { catPath: ["Primi Piatti & Pizza Artigianale", "Pizza Napoletana (Taş Fırın Pizzalar)"], catRank: 2, subRank: 2 };
    }
    if (oldPath.includes("SECONDI PIATTI")) {
      return { catPath: ["Secondi Piatti & Dolci Italiani", "Secondi di Carne e Pesce (Ana Yemekler)"], catRank: 3, subRank: 1 };
    }
    if (oldPath.includes("DOLCE")) {
      return { catPath: ["Secondi Piatti & Dolci Italiani", "Dolci Tradizionali (İtalyan Tatlıları)"], catRank: 3, subRank: 2 };
    }
    return mapBeverage(4);
  }

  return mapBeverage(5);
}

function getOutletTypeKey(outlet: OutletSeed): string {
  if (outlet.isRoomService) return "ROOM_SERVICE";
  const name = outlet.outletName ?? "";
  if (name.includes("Lobby") || name.includes("Captain")) return "LOBBY_LOUNGE";
  if (name.includes("Pool") || name.includes("Beach Bar")) return "POOL_BEACH";
  if (name === "Diamond Royal Tea & Patisserie" || name === "Vienna Cafe") return "CAFE_PATISSERIE";
  if (name === "Merit Premium Cafe Verde") return "CAFE_VERDE";
  if (name.includes("Whiskey")) return "WHISKEY_HOUSE";
  if (name.includes("Shisha")) return "SHISHA_TERRACE";
  if (name.includes("Steakhouse")) return "STEAKHOUSE";
  if (name.includes("Dionysos")) return "WINE_HOUSE";
  if (name.includes("Blue Sea")) return "BLUE_SEA";
  if (name.includes("Mandarin")) return "ROYAL_MANDARIN";
  if (name.includes("Bella Merit")) return "BELLA_MERIT";
  return "POOL_BEACH";
}

// 5. Curated item additions per outlet type from the existing Merit menu pool
function getCuratedAdditionsForOutlet(outletKey: string): MenuItem[] {
  const additions: MenuItem[] = [];
  const add = (name: string, markerCat: string, priceFallback: number) => {
    const it = getPoolItem(name, [markerCat], priceFallback);
    if (it) additions.push(it);
  };

  if (outletKey === "CAFE_PATISSERIE" || outletKey === "CAFE_VERDE") {
    // French & Viennese Cakes
    add("Paris Brest", "CAFE_CAKE", 20);
    add("Mille-Feuille (Milföy Pasta)", "CAFE_CAKE", 24);
    add("Gianduja", "CAFE_CAKE", 20);
    add("Chestnut Cup", "CAFE_CAKE", 21);
    add("Earl Grey Cake", "CAFE_CAKE", 19);
    add("Orman Meyveli Kek", "CAFE_CAKE", 18);
    add("Strudel di Mele (Elmalı Strudel)", "CAFE_CAKE", 16);
    add("Profiterol", "CAFE_CAKE", 15);
    add("El Yapımı Çikolata Seçkisi", "CAFE_CAKE", 22);
    // Cheesecakes, Tiramisu & Dairy Desserts
    add("San Sebastian Cheesecake", "CAFE_CHEESECAKE", 24);
    add("Cheesecake", "CAFE_CHEESECAKE", 24);
    add("Türk Kahvesi ile Hazırlanmış Tiramisu", "CAFE_CHEESECAKE", 19);
    add("Crème Brûlée", "CAFE_CHEESECAKE", 18);
    add("Panna Cotta ai Frutti di Bosco", "CAFE_CHEESECAKE", 20);
    add("Magnolia", "CAFE_CHEESECAKE", 18);
    add("Browni", "CAFE_CHEESECAKE", 18);
    add("Fırın Sütlaç", "CAFE_CHEESECAKE", 18);
    // Baklava, Waffle, Crepes & Fruit
    add("Royal Baklava", "CAFE_WAFFLE", 30);
    add("Havuç Dilim Baklava", "CAFE_WAFFLE", 28);
    add("Waffle", "CAFE_WAFFLE", 22);
    add("Pancake", "CAFE_WAFFLE", 20);
    add("Krep", "CAFE_WAFFLE", 20);
    add("Orman Meyveleri", "CAFE_WAFFLE", 22);
    add("Taze Mevsim Meyveleri", "CAFE_WAFFLE", 18);
    // Light Cafe Sandwiches & Bowls
    add("Kruvasan Sandviç", "CAFE_SANDWICH", 24);
    add("Club Sandwich", "CAFE_SANDWICH", 24);
    add("Mozzarella Caprese Sandviç", "CAFE_SANDWICH", 22);
    add("Kıbrıs Tostu", "CAFE_SANDWICH", 20);
    add("Kaşarlı Tost", "CAFE_SANDWICH", 18);
    add("Smoothie Kâse", "CAFE_SANDWICH", 21);
    add("Yulaf Kâsesi", "CAFE_SANDWICH", 21);
  }

  if (outletKey === "LOBBY_LOUNGE") {
    add("Şarap Tabağı (2 kişilik)", "LOUNGE_FOOD_SANDWICH", 50);
    add("Katsu Sando", "LOUNGE_FOOD_SANDWICH", 38);
    add("Club Sandwich", "LOUNGE_FOOD_SANDWICH", 24);
    add("Kruvasan Sandviç", "LOUNGE_FOOD_SANDWICH", 24);
    add("Soğuk Sandviç", "LOUNGE_FOOD_SANDWICH", 16);
    add("Paris Brest", "LOUNGE_FOOD_DESSERT", 20);
    add("San Sebastian Cheesecake", "LOUNGE_FOOD_DESSERT", 24);
    add("Türk Kahvesi ile Hazırlanmış Tiramisu", "LOUNGE_FOOD_DESSERT", 19);
    add("Royal Baklava", "LOUNGE_FOOD_DESSERT", 32);
    add("El Yapımı Çikolata Seçkisi", "LOUNGE_FOOD_DESSERT", 22);
    add("Orman Meyveleri", "LOUNGE_FOOD_DESSERT", 24);
    // Cold coffees
    add("Ice Americano", "SOĞUK KAHVELER", 20);
    add("Frappuccino", "SOĞUK KAHVELER", 20);
    add("Cold Brew", "SOĞUK KAHVELER", 20);
    add("Affogato", "SOĞUK KAHVELER", 20);
  }

  if (outletKey === "WINE_HOUSE") {
    add("Şarap Tabağı (2 kişilik)", "WINE_PAIRING", 50);
    add("İthal Peynir Tabağı", "WINE_PAIRING", 35);
    add("Peynir Trio", "WINE_PAIRING", 35);
    add("Bresaola, Keçi Peyniri & Roka", "WINE_PAIRING", 38);
    add("Fantasia di Burrata", "WINE_PAIRING", 35);
    add("Dana Carpaccio", "WINE_PAIRING", 37);
    add("Avokado Mantecato", "WINE_PAIRING", 22);
    add("El Yapımı Çikolata Seçkisi", "WINE_PAIRING", 22);
  }

  if (outletKey === "WHISKEY_HOUSE") {
    add("Şarap Tabağı (2 kişilik)", "WHISKEY_BITES", 50);
    add("İthal Peynir Tabağı", "WHISKEY_BITES", 35);
    add("Dana Carpaccio", "WHISKEY_BITES", 37);
    add("Katsu Sando", "WHISKEY_BITES", 40);
    add("Beef Tataki", "WHISKEY_BITES", 65);
    add("El Yapımı Çikolata Seçkisi", "WHISKEY_BITES", 22);
  }

  if (outletKey === "STEAKHOUSE" || outletKey === "BELLA_MERIT" || outletKey === "ROYAL_MANDARIN") {
    // Ensure fine dining restaurants also have water, soft drinks, and espresso/tea at the end of their menu
    for (const drinkName of [
      "Su Cam 330 ml",
      "San Pellegrino",
      "Soda",
      "Limonata",
      "Taze Sıkma Mevsim Meyve Suyu",
      "Coca Cola",
      "Coca Cola Zero",
      "Sprite",
      "Fanta",
      "Ice Tea Şeftali",
      "Ice Tea Limon",
    ]) {
      add(drinkName, "MEŞRUBATLAR", 6);
    }
    for (const hotName of [
      "Single Espresso",
      "Double Espresso",
      "Americano",
      "Cappuccino",
      "Cafe Latte",
      "Türk Kahvesi",
      "Demleme Çay",
      "Ronnefeldt Bitki Çayları",
    ]) {
      add(hotName, "SICAK İÇECEKLER", 10);
    }
  }

  return additions;
}

// 6. Transform all 20 outlets
let totalItemsCount = 0;
let totalLongDetail = 0;
let total1Level = 0;

for (const outlet of rawData.outlets) {
  const outletKey = getOutletTypeKey(outlet);
  const combinedRaw = [...outlet.items, ...getCuratedAdditionsForOutlet(outletKey)];

  const decorated: Array<{
    item: MenuItem;
    catRank: number;
    subRank: number;
    origIndex: number;
  }> = [];

  const seenKey = new Set<string>();

  for (let i = 0; i < combinedRaw.length; i++) {
    const rawItem = combinedRaw[i];
    const mapped = mapCategoryAndOrder(outletKey, rawItem);
    if (!mapped) continue;

    const cleanName = smartTitleCase(rawItem.name);
    const dedupeKey = `${mapped.catPath[0]}::${mapped.catPath[1]}::${cleanName.toLocaleLowerCase("tr")}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);

    const detail = generateConciseDetail(cleanName, mapped.catPath, rawItem.detail);
    const inferred = inferAllergensForItem({
      name: cleanName,
      detail,
      categoryPath: mapped.catPath.join(" > "),
    });

    const mergedAllergens = Array.from(new Set([...(rawItem.allergens ?? []), ...inferred.allergens]));
    const tags = new Set<string>(rawItem.tags ?? []);

    const hay = `${cleanName} ${detail}`.toLocaleLowerCase("tr");
    if (/aci\b|acili|szechuan|arrabbiata|buffalo|atom/.test(hay)) {
      tags.add("ACILI");
    }

    decorated.push({
      item: {
        catPath: mapped.catPath,
        name: cleanName,
        detail,
        price: rawItem.price,
        imageUrl: rawItem.imageUrl,
        allergens: mergedAllergens,
        tags: Array.from(tags),
      },
      catRank: mapped.catRank,
      subRank: mapped.subRank,
      origIndex: i,
    });
  }

  // Sort by category rank -> subcategory rank -> original index
  decorated.sort((a, b) => {
    if (a.catRank !== b.catRank) return a.catRank - b.catRank;
    if (a.subRank !== b.subRank) return a.subRank - b.subRank;
    return a.origIndex - b.origIndex;
  });

  // Ensure exactly 3 signature food/highlight items with images carry "SEFIN_SECIMI" and 4 carry "POPULER"
  let sefinCount = decorated.filter((d) => d.item.tags.includes("SEFIN_SECIMI")).length;
  for (const d of decorated) {
    if (sefinCount >= 3) break;
    if (d.item.imageUrl && !d.item.tags.includes("SEFIN_SECIMI")) {
      d.item.tags.push("SEFIN_SECIMI");
      sefinCount++;
    }
  }
  let populerCount = decorated.filter((d) => d.item.tags.includes("POPULER")).length;
  for (const d of decorated) {
    if (populerCount >= 5) break;
    if (d.item.imageUrl && !d.item.tags.includes("SEFIN_SECIMI") && !d.item.tags.includes("POPULER")) {
      d.item.tags.push("POPULER");
      populerCount++;
    }
  }

  outlet.items = decorated.map((d) => d.item);
  totalItemsCount += outlet.items.length;
  for (const it of outlet.items) {
    if (it.catPath.length < 2) total1Level++;
    if ((it.detail?.length ?? 0) > 140) totalLongDetail++;
  }
}

rawData.version = 2;
writeFileSync(DATA_FILE, JSON.stringify(rawData, null, 2), "utf8");

console.log(`✅ Reorganized 20 outlets (v2): ${totalItemsCount} total items | 1-level: ${total1Level} | >140 chars: ${totalLongDetail}`);
