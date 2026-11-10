-- Açık renkli misafir menüleri (Kasım 2026): tüm Merit outlet'leri (oda servisi dahil, 20 adet) açık zeminli
-- tasarıma geçer. Kaynak: prisma/seed/menuDesigns.ts (OUTLET_DESIGN_PRESETS / ROOM_SERVICE_DESIGN_PRESETS) ve
-- prisma/seed/menuThemes.ts. Tohum var olan tasarımı ezmediği için kurulu sistemler bu migration ile güncellenir.
--
-- DİKKAT: Ürün sahibinin kararıyla bu migration, aşağıdaki 20 outlet'in menü tasarımını (ambiyans, konsept, şablon,
-- yerleşim, seçenekler) ve temasını yeniden yazar; operatörün bu outlet'lerde elle yaptığı tasarım değişiklikleri
-- kaybolur. Diğer outlet'lere, temaların renklerine ve katalogdaki koyu tema/şablonlara dokunulmaz.
-- Idempotent: tekrar çalıştırılması aynı sonucu verir.

-- 1) Eksik açık temalar (ada göre; var olan temanın renkleri korunur).
INSERT INTO "menu_themes" ("id", "name", "bg", "accent", "soft", "text_on_accent", "is_default", "created_at", "updated_at")
SELECT 'c' || substr(md5('menu_theme:' || v.name), 1, 24), v.name, v.bg, v.accent, v.soft, v.text_on_accent, false, now(), now()
FROM (VALUES
  ('Krem', '#faf6ee', '#8a5a2b', '#f1e9da', '#ffffff'),
  ('Four Seasons Fildişi', '#faf8f5', '#785028', '#f0ebe1', '#ffffff'),
  ('Akdeniz Beyazı & Turkuaz', '#f8fcff', '#006994', '#e6f4fa', '#ffffff'),
  ('Sahil Kumu & Mercan', '#fffaf4', '#b84326', '#f7ede1', '#ffffff'),
  ('Pudra & Gül Bahçesi', '#fff8f9', '#9e3a58', '#f8eaee', '#ffffff'),
  ('Fildişi & Altın Zarafet', '#fdfbf7', '#8c6218', '#f4eee1', '#ffffff'),
  ('Adaçayı & Botanik', '#f7fbf8', '#2d6a4f', '#e6f2ea', '#ffffff'),
  ('Santorini Mavi & Beyaz', '#ffffff', '#124e96', '#edf4fc', '#ffffff'),
  ('Şampanya & Kaşmir', '#fcf9f2', '#7c5832', '#f2eadb', '#ffffff'),
  ('Narenciye & Güneş', '#fffdf6', '#a84b00', '#faefd8', '#ffffff'),
  ('Ege İncisi & Mercan', '#f5fbfc', '#0d6973', '#e1f1f4', '#ffffff'),
  ('Porselen & Safir', '#f9fbff', '#1e3f7a', '#eaeff8', '#ffffff'),
  ('Konyak & Kehribar', '#faf4ea', '#7b3f12', '#f0e3cf', '#fffaf2'),
  ('Mahzen Krem & Bordo', '#fbf7f2', '#6e1e32', '#f3e7e3', '#ffffff'),
  ('Kum & Terrakota', '#fbf5ee', '#9a3f1f', '#f3e4d5', '#ffffff'),
  ('Keten & Kömür', '#f7f4ee', '#2e2b28', '#ebe5da', '#f7f4ee'),
  ('Porselen & Lake Kırmızı', '#fbfbf8', '#8c1c22', '#e7efe9', '#ffffff'),
  ('Toskana Krem & Zeytin', '#faf7ee', '#556328', '#eeecdc', '#ffffff')
) AS v("name", "bg", "accent", "soft", "text_on_accent")
ON CONFLICT ("name") DO NOTHING;

-- 2) Varsayılan tema açık: Fildişi & Altın Zarafet (tema atanmamış ve yeni outlet'ler bununla açılır).
UPDATE "menu_themes"
SET "is_default" = ("name" = 'Fildişi & Altın Zarafet'), "updated_at" = now()
WHERE "is_default" <> ("name" = 'Fildişi & Altın Zarafet');

-- 3) Outlet tasarımları ve temaları. Outlet otel koduyla ve ADIYLA eşleşir; oda servisi (outlet_name NULL) otel
--    kodu ve ODA_SERVISI türüyle. Eşleşmeyen satır (outlet yeniden adlandırılmış/yok) sessizce atlanır.
WITH "spec" ("hotel_code", "outlet_name", "ambience", "concept", "template", "layout", "options", "theme_name") AS (
  VALUES
  ('DIAMOND', 'Diamond 24/7 Lobby Lounge', 'LOUNGE', 'ART_DECO', 'CRYSTAL_BAR', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":true,"featuredTitle":"","typography":"EDITORIAL","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"large","heroFontFamily":"cormorant","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Four Seasons Fildişi'),
  ('DIAMOND', 'Diamond Lagoon Pool Bar & Deck', 'POOL', 'DAYLIGHT', 'SUNLIGHT_POOL', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"MODERN","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"montserrat","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Ege İncisi & Mercan'),
  ('DIAMOND', 'Diamond Royal Tea & Patisserie', 'CAFE', 'PASTEL', 'ROSE_PATISSERIE', '["hero","categories","items"]', '{"cardStyle":"PHOTO","categoryTabStyle":"GRID_PILLS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"CLASSIC","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"greatvibes","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Pudra & Gül Bahçesi'),
  ('DIAMOND', 'Diamond Exclusive Whiskey House', 'LOUNGE', 'CLASSIC', 'COGNAC_LIBRARY', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"SYSTEM","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"large","heroFontFamily":"cormorant","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Konyak & Kehribar'),
  ('DIAMOND', 'Shisha & Sunset Terrace', 'ROOFTOP', 'BOHEMIAN', 'SUNSET_SKY_TERRACE', '["hero","categories","items"]', '{"cardStyle":"PHOTO","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":false,"featuredTitle":"","typography":"COASTAL","density":"BALANCED","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"marcellus","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Kum & Terrakota'),
  ('DIAMOND', 'The Steakhouse', 'GOURMET', 'RUSTIC', 'CHEF_TABLE', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":false,"featuredTitle":"","typography":"EDITORIAL","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"playfair","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Keten & Kömür'),
  ('ROYAL', 'Captain’s Lounge Bar', 'LOUNGE', 'DAYLIGHT', 'DAYLIGHT_LOUNGE', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"SERENITY","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"playfair","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Porselen & Safir'),
  ('ROYAL', 'Royal Sea View Pool Bar', 'SUNDECK', 'DAYLIGHT', 'SANTORINI_TERRACE', '["hero","categories","items"]', '{"cardStyle":"PHOTO","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"COASTAL","density":"BALANCED","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"jakarta","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Akdeniz Beyazı & Turkuaz'),
  ('ROYAL', 'Beach Bar', 'SUNDECK', 'RIVIERA', 'WHITE_RIVIERA', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"SEGMENT_CARDS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"COASTAL","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"montserrat","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Sahil Kumu & Mercan'),
  ('ROYAL', 'Dionysos Wine House', 'GOURMET', 'CLASSIC', 'SOMMELIER_CELLAR', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":false,"featuredTitle":"","typography":"CLASSIC","density":"BALANCED","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"large","heroFontFamily":"cormorant","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Mahzen Krem & Bordo'),
  ('ROYAL', 'Vienna Cafe', 'CAFE', 'CLASSIC', 'VIENNA_HERITAGE', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"GRID_PILLS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":true,"featuredTitle":"","typography":"CLASSIC","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"playfair","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Krem'),
  ('ROYAL', 'Blue Sea Alakart', 'SEAFOOD', 'RIVIERA', 'AEGEAN_MARINA', '["hero","categories","items"]', '{"cardStyle":"PHOTO","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":false,"featuredTitle":"","typography":"COASTAL","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"marcellus","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Santorini Mavi & Beyaz'),
  ('ROYAL', 'Royal Mandarin', 'GOURMET', 'MINIMALIST', 'ZEN_ASIAN', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"SERENITY","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"cinzel","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Porselen & Lake Kırmızı'),
  ('ROYAL', 'Bella Merit', 'GOURMET', 'MEDITERRANEAN', 'LUMIERE_DINING', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"EDITORIAL","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"bodoni","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Toskana Krem & Zeytin'),
  ('PREMIUM', 'Premium Lobby & Atrium Bar', 'LOUNGE', 'DAYLIGHT', 'DAYLIGHT_LOUNGE', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"SERENITY","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"cormorant","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Şampanya & Kaşmir'),
  ('PREMIUM', 'Premium Lagoon & Kids Pool Bar', 'POOL', 'DAYLIGHT', 'SUNLIGHT_POOL', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"MODERN","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"jakarta","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Narenciye & Güneş'),
  ('PREMIUM', 'Merit Premium Cafe Verde', 'PATIO', 'DAYLIGHT', 'SUNLIT_VERANDA', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"GRID_PILLS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"HUMANIST","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"left","heroFontSize":"medium","heroFontFamily":"playfair","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Adaçayı & Botanik'),
  ('DIAMOND', NULL, 'RESORT', 'DAYLIGHT', 'IVORY_PALACE', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"SEGMENT_CARDS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"CLASSIC","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"cinzel","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Four Seasons Fildişi'),
  ('ROYAL', NULL, 'RESORT', 'DAYLIGHT', 'IVORY_PALACE', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"SEGMENT_CARDS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"CLASSIC","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"cinzel","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Fildişi & Altın Zarafet'),
  ('PREMIUM', NULL, 'RESORT', 'DAYLIGHT', 'IVORY_PALACE', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"SEGMENT_CARDS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"CLASSIC","density":"AIRY","hero":"TITLE","heroImageUrl":"","curatedPhotos":false,"showSearch":true,"showFilters":true,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"cinzel","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Şampanya & Kaşmir')
),
"target" AS (
  SELECT o."id" AS "outlet_id", s.*
  FROM "spec" s
  JOIN "hotels" h ON h."code" = s."hotel_code"
  JOIN "outlets" o ON o."hotel_id" = h."id"
   AND ((s."outlet_name" IS NOT NULL AND o."name" = s."outlet_name")
     OR (s."outlet_name" IS NULL AND o."type" = 'ODA_SERVISI'))
),
"design" AS (
  INSERT INTO "outlet_menu_designs" ("id", "outlet_id", "ambience", "concept", "template", "layout", "options", "updated_at")
  SELECT 'c' || substr(md5('outlet_menu_design:' || t."outlet_id"), 1, 24), t."outlet_id", t."ambience", t."concept",
         t."template", t."layout"::jsonb, t."options"::jsonb, now()
  FROM "target" t
  ON CONFLICT ("outlet_id") DO UPDATE
  SET "ambience" = EXCLUDED."ambience",
      "concept" = EXCLUDED."concept",
      "template" = EXCLUDED."template",
      "layout" = EXCLUDED."layout",
      "options" = EXCLUDED."options",
      "updated_at" = now()
  RETURNING "outlet_id"
)
UPDATE "outlets" o
SET "theme_id" = mt."id", "updated_at" = now()
FROM "target" t
JOIN "menu_themes" mt ON mt."name" = t."theme_name"
WHERE o."id" = t."outlet_id";
