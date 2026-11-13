-- Uretilen menu kapaklari (14 Kas 2026, urun sahibi karari): basili menu kapagi olmayan on satis noktasinin
-- karsilama alani, noktanin kendi tema renkleri ve baslik yazi tipiyle uretilen kapak gorselini gosterir
-- (scripts/generate-menu-covers.ts, public/merit-menus/kapak-*.jpg). Kaynak: prisma/seed/menuDesigns.ts
-- (GENERATED_COVERS).
--
-- Yalniz iki secenek yazilir: "hero" ve "heroImageUrl". Sablon, tema, yerlesim ve operatorun diger tasarim
-- ayarlari oldugu gibi kalir. Whiskey Lounge, The Roof Garden ve Blue Sea Beach Bar'a dokunulmaz (basili kapaklari
-- 20261111010000 ile geldi). Tekrarlanabilir.
UPDATE "outlet_menu_designs" d
SET "options" = d."options" || jsonb_build_object('hero', 'COVER', 'heroImageUrl', v."url"),
    "updated_at" = now()
FROM (VALUES
  ('DIAMOND', NULL, 'ODA_SERVISI', '/merit-menus/kapak-oda-servisi-diamond.jpg'),
  ('ROYAL', NULL, 'ODA_SERVISI', '/merit-menus/kapak-oda-servisi-royal.jpg'),
  ('PREMIUM', NULL, 'ODA_SERVISI', '/merit-menus/kapak-oda-servisi-premium.jpg'),
  ('DIAMOND', 'Diamond Lobby Bar', NULL, '/merit-menus/kapak-diamond-lobby-bar.jpg'),
  ('ROYAL', 'Royal Lobby Bar', NULL, '/merit-menus/kapak-royal-lobby-bar.jpg'),
  ('PREMIUM', 'Premium Lobby Bar', NULL, '/merit-menus/kapak-premium-lobby-bar.jpg'),
  ('DIAMOND', 'Diamond Pool Bar', NULL, '/merit-menus/kapak-diamond-pool-bar.jpg'),
  ('PREMIUM', 'Premium Pool Bar', NULL, '/merit-menus/kapak-premium-pool-bar.jpg'),
  ('DIAMOND', 'Tea Lounge', NULL, '/merit-menus/kapak-tea-lounge.jpg'),
  ('PREMIUM', 'Cafe Verde', NULL, '/merit-menus/kapak-cafe-verde.jpg')
) AS v("hotel_code", "outlet_name", "outlet_type", "url")
JOIN "hotels" h ON h."code" = v."hotel_code"
JOIN "outlets" o ON o."hotel_id" = h."id"
  AND ((v."outlet_name" IS NOT NULL AND o."name" = v."outlet_name")
    OR (v."outlet_type" IS NOT NULL AND o."type"::text = v."outlet_type"))
WHERE d."outlet_id" = o."id";
