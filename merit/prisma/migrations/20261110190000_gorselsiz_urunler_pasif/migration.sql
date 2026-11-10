-- Gorseli yanlis oldugu icin kaldirilan ve yerine gorsel bulunamayan 7 urun menuden cikarilir (pasif yapilir;
-- gecmis siparis kalemleri bagli olabilecegi icin satir silinmez). Yonetim ekranindan yeniden aktif edilebilir.
-- Tekrarlanabilir.
UPDATE "menu_nodes" n
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
FROM "outlets" o
WHERE o."id" = n."outlet_id" AND n."kind" = 'OGE' AND n."image_url" IS NULL AND n."is_active" = true
  AND o."name" IN ('Shisha & Sunset Terrace', 'Diamond Lagoon Pool Bar & Deck', 'Blue Sea Alakart')
  AND n."name" IN ('Tavuk Kkochi', 'Patates Kızartması', 'Antep Biberli Atom', 'Babagannuş', 'Şakşuka', 'Deniz Balığı Ceviche', 'Deniz Mahsüllü Pazı Sarma');
