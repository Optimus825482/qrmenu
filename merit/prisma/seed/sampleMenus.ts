import type { OutletType } from "@/generated/prisma/client";

export type SampleMenuItem = {
  name: string;
  detail: string;
  price: number;
  image: string;
  allergens?: string[];
  tags?: string[];
};
export type SampleMenuCategory = {
  name: string;
  items?: SampleMenuItem[];
  subcategories?: { name: string; items: SampleMenuItem[] }[];
};

const item = (name: string, detail: string, price: number, image: string, allergens: string[] = [], tags: string[] = []): SampleMenuItem => ({
  name, detail, price, image: `/menu-samples/${image}.webp`, allergens, tags,
});
const CATEGORY_TITLES: Record<string, [string, string, string]> = {
  "24 Saat İmza İçecekleri": ["Kahve & Gece İkramları", "Lounge Atıştırmalıkları", "Gece seçkisi"],
  "Lagün İmza Kokteylleri": ["Detoks & Havuz İkramları", "Soğuk Tatlılar", "Lagün seçkisi"],
  "Dünya Çayları": ["Makaron & Çikolata", "Pasta & Günlük Tatlılar", "Çay saati"],
  "Mahzen Tadım Rehberi": ["Puro Eşlikçileri", "Mahzen Atıştırmalıkları", "Tadım eşlikçileri"],
  "Gün Batımı İçecekleri": ["Nargile Aroma Rehberi", "Teras Atıştırmalıkları", "Gün batımı seçkisi"],
  "Wellness İçecekleri": ["Hafif Dinlenme İkramları", "Bitki Çayları", "Wellness seçkisi"],
  "Marina Klasikleri": ["Kadeh & Aperitif", "Marina Atıştırmalıkları", "Kaptanın seçkisi"],
  "Kıbrıs & Dünya Şarapları": ["Peynir Eşleşmeleri", "Sommelier Seçkisi", "Mahzen seçkisi"],
  "Viyana Kahveleri": ["Strudel & Pastane", "Çay Saati", "Viyana seçkisi"],
  "Deniz Manzaralı Serinlik": ["Havuz Başı İkramları", "Çocuk İçecek & İkram", "Sea View seçkisi"],
  "Hamam Sonrası İçecekler": ["Sessiz Dinlenme İkramları", "Bitki Çayları", "Hamam sonrası"],
  "Atrium İmza İçecekleri": ["Günün Her Saati", "Kahve & Atıştırmalık", "Atrium seçkisi"],
  "Minik Misafirler": ["Aile Bahçesi", "Ebeveyn İkramları", "Aile seçkisi"],
  "Sporcu Hidrasyonu": ["Kort Yanı İkramları", "Hızlı Atıştırmalıklar", "Aktif yaşam seçkisi"],
  "Aile Havuzu İçecekleri": ["Havuz & Çocuk İkramları", "Meyve & Dondurma", "Aile havuzu seçkisi"],
  "Sahil İmzaları": ["Sahil Lezzetleri", "Paylaşım Tabakları", "Kumsal seçkisi"],
  "Havuz Başı Serinlik": ["Hafif Havuz İkramları", "Çocuklara Özel", "Havuz seçkisi"],
};
const cat = (name: string, items: SampleMenuItem[], subName: string, subItems: SampleMenuItem[]): SampleMenuCategory[] => {
  const [second, third, finalSub] = CATEGORY_TITLES[name] ?? ["Günün seçkisi", "Paylaşım & ikram", "Özenle hazırlananlar"];
  return [
  { name, items }, { name: second, subcategories: [{ name: subName, items: subItems }] },
  { name: third, subcategories: [{ name: finalSub, items: [
    item("Mevsim Meyvesi Tabağı", "Mevsiminde seçilmiş taze meyveler, soğuk servis edilir.", 0, "fruit", [], ["VEGAN"]),
    item("Şefin Günlük İkramı", "Günün ürünlerine göre hazırlanan küçük bir lezzet.", 0, "salad", [], ["SEFIN_SECIMI"]),
  ] }] },
];
};

const menusByOutlet: Record<string, SampleMenuCategory[]> = {
  "Diamond 24/7 Lobby Lounge": cat("24 Saat İmza İçecekleri", [
    item("Diamond Old Fashioned", "Olgun viski, aromatik bitters ve portakal kabuğu.", 0, "old-fashioned", ["alkol"], ["SEFIN_SECIMI"]),
    item("İthal Malt Seçkisi", "Sommelier eşliğinde sunulan seçkin malt viskiler.", 0, "whisky", ["alkol"]),
  ], "Kahve & Gece İkramları", [
    item("Vanilyalı Cold Brew", "Uzun demlenmiş soğuk kahve, doğal vanilya.", 0, "coffee"),
    item("Mahzen Kuruyemiş Tabağı", "Kavrulmuş badem, kaju ve kuru meyveler.", 0, "nuts", ["kuruyemis"]),
  ]),
  "Diamond Lagoon Pool Bar & Deck": cat("Lagün İmza Kokteylleri", [
    item("Lagoon Blue", "Narenciye, mavi renkli bitkisel şurup ve soda.", 0, "spritz"),
    item("Tropik Buzlu Çay", "Şeftali, hibiskus ve taze limon.", 0, "lemonade", [], ["VEGAN"]),
  ], "Detoks & Havuz İkramları", [
    item("Salatalık Nane Suyu", "Salatalık, lime ve taze nane ile ferahlatıcı su.", 0, "lemonade", [], ["VEGAN"]),
    item("Günlük Dondurma", "Günün dondurma çeşitleri; servis öncesi görevliye danışın.", 0, "dessert", ["sut"]),
  ]),
  "Diamond Royal Tea & Patisserie": cat("Dünya Çayları", [
    item("Jasmine Silver Needle", "Hafif çiçeksi aromalı, kontrollü ısıda demlenen beyaz çay.", 0, "tea"),
    item("Darjeeling First Flush", "Taze hasat, zarif ve meyvemsi siyah çay.", 0, "tea"),
  ], "Makaron & Çikolata", [
    item("Belçika Çikolatalı Tart", "Yoğun kakao ganajı ve ince çıtır tart.", 0, "dessert", ["gluten", "sut", "yumurta"]),
    item("Renkli Makaronlar", "Günlük hazırlanan makaron seçkisi.", 0, "macaron", ["badem", "yumurta", "sut"]),
  ]),
  "Diamond Exclusive Whiskey House": cat("Mahzen Tadım Rehberi", [
    item("Islay Single Malt", "Turba, deniz esintisi ve uzun bitişli İskoç maltı.", 0, "whisky", ["alkol"]),
    item("Japanese Whisky", "Dengeli meşe ve hafif baharat notaları.", 0, "whisky", ["alkol"]),
  ], "Puro Eşlikçileri", [
    item("Olgun Peynir & Üzüm", "Olgun peynirler, üzüm ve kuru meyve eşleşmesi.", 0, "cheese-platter", ["sut"]),
    item("Kavrulmuş Kuruyemiş", "Badem, fındık ve kaju seçkisi.", 0, "nuts", ["kuruyemis"]),
  ]),
  "Shisha & Sunset Terrace": cat("Gün Batımı İçecekleri", [
    item("Sunset Pomegranate", "Nar, lime ve taze biberiye.", 0, "pomegranate", [], ["VEGAN"]),
    item("Terrace Spritz", "Turunçgil ve köpüklü içecekle hafif teras klasiği.", 0, "spritz", ["alkol"]),
  ], "Nargile Aroma Rehberi", [
    item("Akdeniz Nane", "Serin nane profili; yoğunluk tercihinizi görevliye iletin.", 0, "tea"),
    item("Tropik Meyve", "Mango ve ananas aromalı harman; yoğunluk tercihe göre.", 0, "fruit"),
  ]),
  "Diamond Royal Spa & Wellness": cat("Wellness İçecekleri", [
    item("Zencefil & Limon İnfüzyonu", "Taze zencefil, limon ve sıcak su.", 0, "tea", [], ["VEGAN"]),
    item("Yeşil Bahçe Smoothie", "Ispanak, elma, salatalık ve taze zencefil.", 0, "smoothie", [], ["VEGAN"]),
  ], "Hafif Dinlenme İkramları", [
    item("Mevsim Meyveleri", "Özenle seçilmiş mevsim meyveleri.", 0, "fruit", [], ["VEGAN"]),
    item("Bahçe Kinoa Kasesi", "Kinoa, taze yeşillik ve narenciye sosu.", 0, "salad", [], ["VEGAN"]),
  ]),
  "Captain’s Lounge Bar": cat("Marina Klasikleri", [
    item("Captain’s Martini", "Cin, kuru vermut ve limon kabuğu.", 0, "cocktail", ["alkol"]),
    item("Akdeniz Spritz", "Turunçgil, köpüklü şarap ve zeytin dokunuşu.", 0, "spritz", ["alkol"]),
  ], "Kadeh & Aperitif", [
    item("Günün Kadeh Şarabı", "Servis ekibinden günün yerli ve seçkin şaraplarını öğrenin.", 0, "wine", ["alkol"]),
    item("Marina Kuruyemişleri", "Badem, kaju, zeytin ve kuru meyve.", 0, "nuts", ["kuruyemis"]),
  ]),
  "Dionysos Wine House": cat("Kıbrıs & Dünya Şarapları", [
    item("Commandaria Tadım Notu", "Kıbrıs'ın geleneksel tatlı şarabı için servis ekibinden bilgi alın.", 0, "wine", ["alkol"]),
    item("Yerli Üzüm Seçkisi", "Günün yerli üzüm ve rekolte seçkisi.", 0, "wine", ["alkol"]),
  ], "Peynir Eşleşmeleri", [
    item("Olgun Peynir Tabağı", "Olgun peynir, üzüm ve kuru meyve eşleşmesi.", 0, "cheese-platter", ["sut"]),
    item("Sommelier Tadım Talebi", "Kadeh tadımı ve üzüm profili için sommelier çağırın.", 0, "wine"),
  ]),
  "Vienna Cafe": cat("Viyana Kahveleri", [
    item("Wiener Melange", "Espresso, sıcak süt ve ipeksi süt köpüğü.", 0, "coffee", ["sut"]),
    item("Einspänner", "Yoğun kahve, hafif kremalı klasik Viyana sunumu.", 0, "coffee", ["sut"]),
  ], "Strudel & Pastane", [
    item("Elmalı Strudel", "Tarçınlı elma dolgusu ve ince katlı hamur.", 0, "strudel", ["gluten", "sut"]),
    item("Sacher Usulü Çikolatalı Pasta", "Kayısı dokunuşu ve bitter çikolata.", 0, "dessert", ["gluten", "sut", "yumurta"]),
  ]),
  "Royal Sea View Pool Bar": cat("Deniz Manzaralı Serinlik", [
    item("Sea View Cooler", "Lime, taze nane ve soğuk soda.", 0, "pomegranate", [], ["VEGAN"]),
    item("Taze Meyve Kokteyli", "Günün meyveleriyle alkolsüz hazırlanır.", 0, "cocktail", [], ["VEGAN"]),
  ], "Havuz Başı İkramları", [
    item("Karpuz & Hellim", "Soğuk karpuz, hellim ve taze nane.", 0, "watermelon", ["sut"]),
    item("Çocuk Meyve Tabağı", "Çocuk misafirler için mevsim meyvesi seçkisi.", 0, "fruit", [], ["VEGAN"]),
  ]),
  "Royal Spa & Hamam Dinlenme": cat("Hamam Sonrası İçecekler", [
    item("Geleneksel Nane Limon", "Taze nane ve limonla hazırlanan sıcak içecek.", 0, "tea", [], ["VEGAN"]),
    item("Kış Bahçesi Bitki Çayı", "Mevsim bitkilerinden kafeinsiz demleme.", 0, "tea", [], ["VEGAN"]),
  ], "Sessiz Dinlenme İkramları", [
    item("Soğuk Elma Dilimleri", "Soğuk servis edilen taze elma.", 0, "fruit", [], ["VEGAN"]),
    item("Doğal Soda", "Soğuk servis edilen sade soda.", 0, "lemonade", [], ["VEGAN"]),
  ]),
  "Premium Lobby & Atrium Bar": cat("Atrium İmza İçecekleri", [
    item("Atrium Royal Cocktail", "Narenciye ve hafif baharat notaları.", 0, "cocktail"),
    item("Premium Sıcak Çikolata", "Yoğun kakao ve kadifemsi süt köpüğü.", 0, "coffee", ["sut"]),
  ], "Günün Her Saati", [
    item("Soğuk Kahve", "Taze demlenmiş kahve, soğuk servis.", 0, "coffee"),
    item("Atrium Çerez Tabağı", "Kavrulmuş kuruyemiş ve kuru meyve seçkisi.", 0, "nuts", ["kuruyemis"]),
  ]),
  "Meritta Club Park & Aile Bahçesi": cat("Minik Misafirler", [
    item("Renkli Meyve Suyu", "Mevsim meyvelerinden taze hazırlanır.", 0, "lemonade", [], ["VEGAN"]),
    item("Günlük Dondurma", "Alerjen bilgisi ve günün çeşitleri için görevliye danışın.", 0, "dessert", ["sut"]),
  ], "Aile Bahçesi", [
    item("Mini Peynirli Sandviç", "Peynir ve taze yeşillikle hazırlanır.", 0, "sandwich", ["gluten", "sut"]),
    item("Ebeveyn Soğuk Kahvesi", "Sütlü veya sade tercih edilebilir.", 0, "coffee", ["sut"]),
  ]),
  "Tenis Kortları & Açık Hava Fitness": cat("Sporcu Hidrasyonu", [
    item("Hindistan Cevizi Suyu", "Soğuk servis edilen doğal hindistan cevizi suyu.", 0, "lemonade", [], ["VEGAN"]),
    item("Proteinli Meyve Shake", "Meyve ve protein karışımı; içerik için görevliye danışın.", 0, "smoothie", ["sut"]),
  ], "Kort Yanı İkramları", [
    item("Enerji Meyve Tabağı", "Antrenman öncesi ve sonrası mevsim meyveleri.", 0, "fruit", [], ["VEGAN"]),
    item("Sebzeli Flatbread", "Fırınlanmış sebze ve taze otlarla.", 0, "flatbread", ["gluten"]),
  ]),
  "Premium Lagoon & Kids Pool Bar": cat("Aile Havuzu İçecekleri", [
    item("Tropik Alkolsüz Punch", "Ananas, portakal ve taze lime.", 0, "lemonade", [], ["VEGAN"]),
    item("Çilekli Smoothie", "Çilek, muz ve yoğurtla hazırlanır.", 0, "smoothie", ["sut"]),
  ], "Havuz & Çocuk İkramları", [
    item("Renkli Meyve Şişleri", "Mevsim meyveleri, soğuk servis edilir.", 0, "fruit", [], ["VEGAN"]),
    item("Çocuk Dondurması", "Kırılmaz servis ekipmanıyla sunulur; çeşit için görevliye danışın.", 0, "dessert", ["sut"]),
  ]),
  "Beach Bar": cat("Sahil İmzaları", [
    item("Coastal Spritz", "Turunçgil, köpüklü içecek ve hafif bitkisel dokunuş.", 0, "spritz", ["alkol"], ["SEFIN_SECIMI"]),
    item("Tropik Limonata", "Ananas, limon ve taze nane.", 0, "lemonade", [], ["VEGAN"]),
  ], "Sahil Lezzetleri", [
    item("Izgara Levrek Flatbread", "Izgara levrek, otlu sos ve roka.", 0, "flatbread", ["gluten", "balik"]),
    item("Yaz Salatası", "Domates, salatalık, zeytin ve beyaz peynir.", 0, "salad", ["sut"], ["VEJETARYEN"]),
  ]),
  "Havuz Bar": cat("Havuz Başı Serinlik", [
    item("Taze Naneli Limonata", "Günlük limon ve taze nane.", 0, "lemonade", [], ["VEGAN"]),
    item("Karpuzlu Smoothie", "Karpuz, çilek ve soğuk yoğurt.", 0, "smoothie", ["sut"]),
  ], "Hafif Havuz İkramları", [
    item("Akdeniz Bowl", "Izgara sebze, yeşillik ve tahıllı taban.", 0, "salad", [], ["VEJETARYEN"]),
    item("Izgara Tavuklu Flatbread", "Taze otlar ve yoğurtlu sos ile.", 0, "flatbread", ["gluten", "sut"]),
  ]),
};

const LEGACY_SEED_CATEGORIES = new Set([
  "İmza Kokteyller", "Serinletici Seçimler", "Paylaşmalıklar", "Beach İmzaları", "Sahil Lezzetleri", "Paylaşım Zamanı",
  "Günün Serinliği", "Havuz Favorileri", "Minik Misafirler", "Barista Seçkisi", "Pastane Vitrini", "Çay Saati",
  "Wellness İçecekleri", "Hafif Lezzetler", "Bitki Çayları", "Bahçe Favorileri", "Açık Hava Sofrası", "Tatlı Mola",
  "Günün seçkisi", "Paylaşım & ikram",
]);

export function isLegacySampleCategory(name: string): boolean { return LEGACY_SEED_CATEGORIES.has(name); }

export function sampleMenuForOutlet(type: OutletType, name: string): SampleMenuCategory[] {
  if (menusByOutlet[name]) return menusByOutlet[name];
  if (type === "BAR" && /beach|sahil/i.test(name)) return menusByOutlet["Beach Bar"];
  if (type === "HAVUZ" || type === "CABANA") return menusByOutlet["Havuz Bar"];
  return cat("İmza Seçkisi", [
    item("Günün İçeceği", "Özenle hazırlanan günün seçkisi.", 0, "lemonade"),
    item("Mevsim Lezzeti", "Mevsim ürünleriyle hazırlanan özel ikram.", 0, "salad"),
  ], "Günlük İkramlar", [
    item("Taze Meyve", "Mevsiminde seçilmiş taze meyveler.", 0, "fruit", [], ["VEGAN"]),
    item("Günün Tatlısı", "Günlük hazırlanan tatlı seçkisi.", 0, "dessert", ["gluten", "sut"]),
  ]);
}
