-- Alakart restoranlar QR menuye geri alindi (14 Kas 2026, urun sahibi karari): The Steakhouse (Diamond),
-- Royal Mandarin ve Bella Merit (Royal). Kasim basinda kaldirilirken siparisi olan nokta silinmemis, pasife
-- alinmisti; o kayitlar yeniden etkinlesir. Silinmis olanlari acilistaki menu senkronu yeniden kurar
-- (prisma/seed/outlets.ts, meritMenus.ts). Tekrarlanabilir.
UPDATE "outlets" o
SET "is_active" = true, "updated_at" = now()
FROM "hotels" h
WHERE h."id" = o."hotel_id"
  AND ((h."code" = 'DIAMOND' AND o."name" = 'The Steakhouse')
    OR (h."code" = 'ROYAL' AND o."name" IN ('Royal Mandarin', 'Bella Merit')))
  AND o."is_active" = false;

-- Duran tasarim kayitlari uretilen kapagi alir; yalniz "hero" ve "heroImageUrl" yazilir (20261114010000 ile ayni kural).
UPDATE "outlet_menu_designs" d
SET "options" = d."options" || jsonb_build_object('hero', 'COVER', 'heroImageUrl', v."url"),
    "updated_at" = now()
FROM (VALUES
  ('DIAMOND', 'The Steakhouse', '/merit-menus/kapak-the-steakhouse.jpg'),
  ('ROYAL', 'Royal Mandarin', '/merit-menus/kapak-royal-mandarin.jpg'),
  ('ROYAL', 'Bella Merit', '/merit-menus/kapak-bella-merit.jpg')
) AS v("hotel_code", "outlet_name", "url")
JOIN "hotels" h ON h."code" = v."hotel_code"
JOIN "outlets" o ON o."hotel_id" = h."id" AND o."name" = v."outlet_name"
WHERE d."outlet_id" = o."id";
