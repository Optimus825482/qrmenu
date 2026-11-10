-- Kapak gorselli menuler (11 Kas 2026, urun sahibi karari): Whiskey Lounge, The Roof Garden ve Blue Sea Beach Bar
-- basili menu kapaklarini karsilama alani olarak kullanir ve sayfa kapagin renklerini alir. Whiskey Lounge
-- (lacivert & altin) ve The Roof Garden (komur & bakir) bu yuzden bilerek koyu zeminlidir.
-- Kaynak: prisma/seed/menuDesigns.ts (OUTLET_DESIGN_PRESETS) ve prisma/seed/menuThemes.ts.
--
-- DIKKAT: Bu uc satis noktasinin menu tasarimi (ambiyans, konsept, sablon, yerlesim, secenekler) ve temasi yeniden
-- yazilir; operatorun bu uc noktada elle yaptigi tasarim degisiklikleri kaybolur. Baska noktaya dokunulmaz.
-- Tekrarlanabilir.

-- 1) Kapak renklerinden uretilen temalar (ada gore; var olan temanin renkleri korunur).
INSERT INTO "menu_themes" ("id", "name", "bg", "accent", "soft", "text_on_accent", "is_default", "created_at", "updated_at")
SELECT 'c' || substr(md5('menu_theme:' || v.name), 1, 24), v.name, v.bg, v.accent, v.soft, v.text_on_accent, false, now(), now()
FROM (VALUES
  ('Whiskey Lounge Lacivert & Altın', '#0e4f77', '#ecd08a', '#0a4165', '#0a3350'),
  ('Roof Garden Kömür & Bakır', '#231f20', '#cf9a6c', '#2f2a2b', '#231f20'),
  ('Blue Sea Beyaz & Lacivert', '#f8f9fa', '#1c2a70', '#e4ebf1', '#ffffff')
) AS v("name", "bg", "accent", "soft", "text_on_accent")
ON CONFLICT ("name") DO NOTHING;

-- 2) Tasarim ve tema. Satis noktasi otel kodu ve adiyla eslesir.
WITH "spec" ("hotel_code", "outlet_name", "ambience", "concept", "template", "layout", "options", "theme_name") AS (VALUES
  ('DIAMOND', 'Whiskey Lounge', 'LOUNGE', 'CLASSIC', 'COGNAC_LIBRARY', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"UNDERLINE_TABS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":true,"featuredTitle":"","typography":"SYSTEM","density":"AIRY","hero":"COVER","heroImageUrl":"/merit-menus/kapak-whiskey-lounge.jpg","logoUrl":"","introSplash":true,"curatedPhotos":false,"priceLists":true,"showSearch":true,"showFilters":false,"showFeatured":false,"heroAlign":"center","heroFontSize":"large","heroFontFamily":"cormorant","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Whiskey Lounge Lacivert & Altın'),
  ('ROYAL', 'The Roof Garden', 'LOUNGE', 'CONTEMPORARY', 'SPEAKEASY_BAR', '["hero","categories","items"]', '{"cardStyle":"LIST","categoryTabStyle":"CHIPS_ROW","showImages":true,"showAllergens":true,"showTags":true,"showPrices":true,"uppercaseCategories":false,"featuredTitle":"","typography":"MODERN","density":"COMPACT","hero":"COVER","heroImageUrl":"/merit-menus/kapak-roof-garden.jpg","logoUrl":"","introSplash":true,"curatedPhotos":false,"priceLists":true,"showSearch":true,"showFilters":false,"showFeatured":false,"heroAlign":"center","heroFontSize":"xlarge","heroFontFamily":"greatvibes","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Roof Garden Kömür & Bakır'),
  ('ROYAL', 'Blue Sea Beach Bar', 'SUNDECK', 'RIVIERA', 'WHITE_RIVIERA', '["hero","categories","items"]', '{"cardStyle":"CARD","categoryTabStyle":"SEGMENT_CARDS","showImages":true,"showAllergens":true,"showTags":true,"showPrices":false,"uppercaseCategories":false,"featuredTitle":"","typography":"COASTAL","density":"AIRY","hero":"COVER","heroImageUrl":"/merit-menus/kapak-blue-sea.jpg","logoUrl":"","introSplash":true,"curatedPhotos":false,"priceLists":true,"showSearch":true,"showFilters":false,"showFeatured":false,"heroAlign":"center","heroFontSize":"medium","heroFontFamily":"montserrat","heroBgColor":"","heroTextColor":"","callWaiterText":"","callWaiterPosition":"STICKY_FOOTER"}', 'Blue Sea Beyaz & Lacivert')
),
"target" AS (
  SELECT o."id" AS "outlet_id", s.*
  FROM "spec" s
  JOIN "hotels" h ON h."code" = s."hotel_code"
  JOIN "outlets" o ON o."hotel_id" = h."id" AND o."name" = s."outlet_name"
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
