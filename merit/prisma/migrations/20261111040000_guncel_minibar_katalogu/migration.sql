-- Guncel minibar katalogu (11 Kas 2026, urun sahibi: "MINIBAR URUNLERI" tablosu ve "MyBar ek notlari").
--  * Urunler: tablodaki 46 urun aktif; tabloda olmayan butun urunler (Mr Brown dahil) pasife alinir. Pasif urun
--    silinmez: eski islem gecmisi ona bagli kalir.
--  * Setuplar: tablodaki bes liste bes setup olur ve icerikleri tabloya gore YENIDEN YAZILIR. Diger butun setuplar
--    pasife alinir. Bes setup "dolap disi" isaretlenir: iki dolapli King odada liste tek kez gorunur.
--  * Oda tipi baglantilari: her oda tipi yalniz kendi otelinin listesine baglanir (adinda KING gecen tip King listesine).
--  * Adetler tabloda yok: su, Pepsi ve soda 2, digerleri 1 (Tanimlar > Setuplar ekranindan degistirilebilir).
--  * Oda kontrol sirasi: eski sistemdeki giris sirasi, eski urunun yerini alan yeni urune tasindi.
--  * Havuz: yeni urunler icin her otelde 0 adetlik havuz satiri acilir; var olan bakiyeye dokunulmaz.
--  * MyBar: urun basina en cok 5 adet (- 1 +).
-- DIKKAT: Bes setup disinda elle tanimlanmis setup / oda tipi baglantisi varsa devre disi kalir. Tekrarlanabilir.
BEGIN;

CREATE TEMP TABLE "_kat_urun" ("name" TEXT, "unit" TEXT, "grp" TEXT, "sira" INTEGER);
INSERT INTO "_kat_urun" VALUES
  ('Taşkesti Su 0.75 cl', 'Adet', 'Su & Soda', 200),
  ('Taşkesti Su 0.33 cl', 'Adet', 'Su & Soda', 40),
  ('Soda 200 ml', 'Şişe', 'Su & Soda', 10),
  ('Pellegrino 250 ml', 'Şişe', 'Su & Soda', 270),
  ('Perrier 200 ml', 'Şişe', 'Su & Soda', 250),
  ('Pepsi 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 60),
  ('Diet Pepsi 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 50),
  ('Yedigün 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 70),
  ('Seven Up 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 80),
  ('İce Tea Limon 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 150),
  ('İce Tea Şeftali 330 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 130),
  ('Gustavo Latte 250 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 30),
  ('Gustavo Mocha 250 ml', 'Kutu', 'Soğuk İçecekler & Meşrubat', 120),
  ('Redbull 250 ml.', 'Kutu', 'Soğuk İçecekler & Meşrubat', 100),
  ('Efes Pilsen 0.33 cl', 'Şişe', 'Alkol & Şarap', 90),
  ('Mateus Rose 187 ml.', 'Şişe', 'Alkol & Şarap', 220),
  ('JP Chenet Champaigne 200 ml.', 'Şişe', 'Alkol & Şarap', 260),
  ('Masion Castel Chardonay 187 ml', 'Şişe', 'Alkol & Şarap', 190),
  ('Masion Castel Merlot 187 ml.', 'Şişe', 'Alkol & Şarap', 180),
  ('Nescafe Gold 2 gr.', 'Poşet', 'Sıcak İçecekler & Kahve', 240),
  ('Coffee Mate 5 gr.', 'Poşet', 'Sıcak İçecekler & Kahve', 310),
  ('Beyaz Şeker 2 gr.', 'Paket', 'Sıcak İçecekler & Kahve', 330),
  ('Esmer Şeker 2 gr.', 'Paket', 'Sıcak İçecekler & Kahve', 360),
  ('Sakarin ( Tatlandırıcı)', 'Paket', 'Sıcak İçecekler & Kahve', 380),
  ('Segafredo Kahve 6 gr', 'Kapsül', 'Sıcak İçecekler & Kahve', 110),
  ('Türk Kahvesi', 'Paket', 'Sıcak İçecekler & Kahve', 115),
  ('Tuzlu Fıstık 60 gr.', 'Paket', 'Cips & Kraker & Bisküvi', 230),
  ('Ülker Çizi 70 gr.', 'Paket', 'Cips & Kraker & Bisküvi', 500),
  ('Eti Crax 50 gr.', 'Paket', 'Cips & Kraker & Bisküvi', 480),
  ('Pringles Cips 40 gr.', 'Kutu', 'Cips & Kraker & Bisküvi', 440),
  ('Maretti Bruschette Domatesli 70 gr.', 'Paket', 'Cips & Kraker & Bisküvi', 390),
  ('Maretti Bruschette Peynirli 70 gr.', 'Paket', 'Cips & Kraker & Bisküvi', 370),
  ('Çokonat 33 gr.', 'Adet', 'Atıştırmalık & Çikolata', 160),
  ('Brownie Intense 50 gr.', 'Adet', 'Atıştırmalık & Çikolata', 20),
  ('Haribo 100 gr.', 'Paket', 'Atıştırmalık & Çikolata', 470),
  ('Benimo 80 gr.', 'Paket', 'Atıştırmalık & Çikolata', 400),
  ('Eti Puf 18 gr.', 'Adet', 'Atıştırmalık & Çikolata', 450),
  ('Pop Kek 40 gr.', 'Adet', 'Atıştırmalık & Çikolata', 460),
  ('Eti Cin 25 gr.', 'Adet', 'Atıştırmalık & Çikolata', 430),
  ('Snickers 50 GR.', 'Adet', 'Atıştırmalık & Çikolata', 340),
  ('Nesfit Kırmızı Meyveli', 'Paket', 'Atıştırmalık & Çikolata', 320),
  ('Nesfit Karamelli', 'Paket', 'Atıştırmalık & Çikolata', 300),
  ('Nesfit Kakaolu', 'Paket', 'Atıştırmalık & Çikolata', 290),
  ('Nesfit Sütlü Muzlu Çikolatalı', 'Paket', 'Atıştırmalık & Çikolata', 280),
  ('First Naneli Sakız 27 gr', 'Paket', 'Atıştırmalık & Çikolata', 410),
  ('First Çilekli Sakız 27 gr', 'Paket', 'Atıştırmalık & Çikolata', 420);

CREATE TEMP TABLE "_kat_setup" ("setup" TEXT, "urun" TEXT, "qty" INTEGER);
INSERT INTO "_kat_setup" VALUES
  ('Diamond Standart & Suit Setup', 'Taşkesti Su 0.75 cl', 2),
  ('Diamond Standart & Suit Setup', 'Taşkesti Su 0.33 cl', 2),
  ('Diamond Standart & Suit Setup', 'Pepsi 330 ml', 2),
  ('Diamond Standart & Suit Setup', 'Diet Pepsi 330 ml', 2),
  ('Diamond Standart & Suit Setup', 'Yedigün 330 ml', 1),
  ('Diamond Standart & Suit Setup', 'Seven Up 330 ml', 1),
  ('Diamond Standart & Suit Setup', 'İce Tea Limon 330 ml', 1),
  ('Diamond Standart & Suit Setup', 'İce Tea Şeftali 330 ml', 1),
  ('Diamond Standart & Suit Setup', 'Gustavo Latte 250 ml', 1),
  ('Diamond Standart & Suit Setup', 'Gustavo Mocha 250 ml', 1),
  ('Diamond Standart & Suit Setup', 'Soda 200 ml', 2),
  ('Diamond Standart & Suit Setup', 'Efes Pilsen 0.33 cl', 1),
  ('Diamond Standart & Suit Setup', 'Nescafe Gold 2 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Coffee Mate 5 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Beyaz Şeker 2 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Esmer Şeker 2 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Sakarin ( Tatlandırıcı)', 1),
  ('Diamond Standart & Suit Setup', 'Redbull 250 ml.', 1),
  ('Diamond Standart & Suit Setup', 'Çokonat 33 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Brownie Intense 50 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Tuzlu Fıstık 60 gr.', 1),
  ('Diamond Standart & Suit Setup', 'Segafredo Kahve 6 gr', 1),
  ('Royal Standart & Suit Setup', 'Taşkesti Su 0.75 cl', 2),
  ('Royal Standart & Suit Setup', 'Taşkesti Su 0.33 cl', 2),
  ('Royal Standart & Suit Setup', 'Pepsi 330 ml', 2),
  ('Royal Standart & Suit Setup', 'Diet Pepsi 330 ml', 2),
  ('Royal Standart & Suit Setup', 'Yedigün 330 ml', 1),
  ('Royal Standart & Suit Setup', 'Seven Up 330 ml', 1),
  ('Royal Standart & Suit Setup', 'İce Tea Limon 330 ml', 1),
  ('Royal Standart & Suit Setup', 'İce Tea Şeftali 330 ml', 1),
  ('Royal Standart & Suit Setup', 'Gustavo Latte 250 ml', 1),
  ('Royal Standart & Suit Setup', 'Gustavo Mocha 250 ml', 1),
  ('Royal Standart & Suit Setup', 'Soda 200 ml', 2),
  ('Royal Standart & Suit Setup', 'Efes Pilsen 0.33 cl', 1),
  ('Royal Standart & Suit Setup', 'Nescafe Gold 2 gr.', 1),
  ('Royal Standart & Suit Setup', 'Coffee Mate 5 gr.', 1),
  ('Royal Standart & Suit Setup', 'Beyaz Şeker 2 gr.', 1),
  ('Royal Standart & Suit Setup', 'Esmer Şeker 2 gr.', 1),
  ('Royal Standart & Suit Setup', 'Sakarin ( Tatlandırıcı)', 1),
  ('Royal Standart & Suit Setup', 'Redbull 250 ml.', 1),
  ('Royal Standart & Suit Setup', 'Çokonat 33 gr.', 1),
  ('Royal Standart & Suit Setup', 'Brownie Intense 50 gr.', 1),
  ('Royal Standart & Suit Setup', 'Tuzlu Fıstık 60 gr.', 1),
  ('Royal Standart & Suit Setup', 'Segafredo Kahve 6 gr', 1),
  ('Premium Standart & Suit Setup', 'Taşkesti Su 0.75 cl', 2),
  ('Premium Standart & Suit Setup', 'Taşkesti Su 0.33 cl', 2),
  ('Premium Standart & Suit Setup', 'Pepsi 330 ml', 2),
  ('Premium Standart & Suit Setup', 'Diet Pepsi 330 ml', 2),
  ('Premium Standart & Suit Setup', 'Yedigün 330 ml', 1),
  ('Premium Standart & Suit Setup', 'Seven Up 330 ml', 1),
  ('Premium Standart & Suit Setup', 'İce Tea Limon 330 ml', 1),
  ('Premium Standart & Suit Setup', 'İce Tea Şeftali 330 ml', 1),
  ('Premium Standart & Suit Setup', 'Gustavo Latte 250 ml', 1),
  ('Premium Standart & Suit Setup', 'Gustavo Mocha 250 ml', 1),
  ('Premium Standart & Suit Setup', 'Soda 200 ml', 2),
  ('Premium Standart & Suit Setup', 'Efes Pilsen 0.33 cl', 1),
  ('Premium Standart & Suit Setup', 'Nescafe Gold 2 gr.', 1),
  ('Premium Standart & Suit Setup', 'Coffee Mate 5 gr.', 1),
  ('Premium Standart & Suit Setup', 'Beyaz Şeker 2 gr.', 1),
  ('Premium Standart & Suit Setup', 'Esmer Şeker 2 gr.', 1),
  ('Premium Standart & Suit Setup', 'Sakarin ( Tatlandırıcı)', 1),
  ('Premium Standart & Suit Setup', 'Redbull 250 ml.', 1),
  ('Premium Standart & Suit Setup', 'Çokonat 33 gr.', 1),
  ('Premium Standart & Suit Setup', 'Brownie Intense 50 gr.', 1),
  ('Premium Standart & Suit Setup', 'Tuzlu Fıstık 60 gr.', 1),
  ('Premium Standart & Suit Setup', 'Segafredo Kahve 6 gr', 1),
  ('Premium Standart & Suit Setup', 'Ülker Çizi 70 gr.', 1),
  ('Premium Standart & Suit Setup', 'Haribo 100 gr.', 1),
  ('Premium Standart & Suit Setup', 'Eti Crax 50 gr.', 1),
  ('Premium Standart & Suit Setup', 'Benimo 80 gr.', 1),
  ('Premium Standart & Suit Setup', 'Eti Puf 18 gr.', 1),
  ('Premium Standart & Suit Setup', 'Pop Kek 40 gr.', 1),
  ('Premium Standart & Suit Setup', 'Eti Cin 25 gr.', 1),
  ('Diamond & Royal King Setup', 'Taşkesti Su 0.75 cl', 2),
  ('Diamond & Royal King Setup', 'Taşkesti Su 0.33 cl', 2),
  ('Diamond & Royal King Setup', 'Pepsi 330 ml', 2),
  ('Diamond & Royal King Setup', 'Diet Pepsi 330 ml', 2),
  ('Diamond & Royal King Setup', 'Yedigün 330 ml', 1),
  ('Diamond & Royal King Setup', 'Seven Up 330 ml', 1),
  ('Diamond & Royal King Setup', 'İce Tea Limon 330 ml', 1),
  ('Diamond & Royal King Setup', 'İce Tea Şeftali 330 ml', 1),
  ('Diamond & Royal King Setup', 'Gustavo Latte 250 ml', 1),
  ('Diamond & Royal King Setup', 'Gustavo Mocha 250 ml', 1),
  ('Diamond & Royal King Setup', 'Pellegrino 250 ml', 1),
  ('Diamond & Royal King Setup', 'Perrier 200 ml', 1),
  ('Diamond & Royal King Setup', 'Efes Pilsen 0.33 cl', 1),
  ('Diamond & Royal King Setup', 'Nescafe Gold 2 gr.', 1),
  ('Diamond & Royal King Setup', 'Coffee Mate 5 gr.', 1),
  ('Diamond & Royal King Setup', 'Beyaz Şeker 2 gr.', 1),
  ('Diamond & Royal King Setup', 'Esmer Şeker 2 gr.', 1),
  ('Diamond & Royal King Setup', 'Sakarin ( Tatlandırıcı)', 1),
  ('Diamond & Royal King Setup', 'Redbull 250 ml.', 1),
  ('Diamond & Royal King Setup', 'Çokonat 33 gr.', 1),
  ('Diamond & Royal King Setup', 'Brownie Intense 50 gr.', 1),
  ('Diamond & Royal King Setup', 'Tuzlu Fıstık 60 gr.', 1),
  ('Diamond & Royal King Setup', 'Segafredo Kahve 6 gr', 1),
  ('Diamond & Royal King Setup', 'Mateus Rose 187 ml.', 1),
  ('Diamond & Royal King Setup', 'JP Chenet Champaigne 200 ml.', 1),
  ('Diamond & Royal King Setup', 'Masion Castel Chardonay 187 ml', 1),
  ('Diamond & Royal King Setup', 'Masion Castel Merlot 187 ml.', 1),
  ('Diamond & Royal King Setup', 'Pringles Cips 40 gr.', 1),
  ('Diamond & Royal King Setup', 'Maretti Bruschette Domatesli 70 gr.', 1),
  ('Diamond & Royal King Setup', 'Maretti Bruschette Peynirli 70 gr.', 1),
  ('Diamond & Royal King Setup', 'Türk Kahvesi', 1),
  ('Diamond & Royal King Setup', 'Eti Crax 50 gr.', 1),
  ('Diamond & Royal King Setup', 'Snickers 50 GR.', 1),
  ('Diamond & Royal King Setup', 'Nesfit Kırmızı Meyveli', 1),
  ('Diamond & Royal King Setup', 'Nesfit Karamelli', 1),
  ('Diamond & Royal King Setup', 'Nesfit Kakaolu', 1),
  ('Diamond & Royal King Setup', 'Nesfit Sütlü Muzlu Çikolatalı', 1),
  ('Diamond & Royal King Setup', 'First Naneli Sakız 27 gr', 1),
  ('Diamond & Royal King Setup', 'First Çilekli Sakız 27 gr', 1),
  ('Premium King Suite Setup', 'Taşkesti Su 0.75 cl', 2),
  ('Premium King Suite Setup', 'Taşkesti Su 0.33 cl', 2),
  ('Premium King Suite Setup', 'Pepsi 330 ml', 2),
  ('Premium King Suite Setup', 'Diet Pepsi 330 ml', 2),
  ('Premium King Suite Setup', 'Yedigün 330 ml', 1),
  ('Premium King Suite Setup', 'Seven Up 330 ml', 1),
  ('Premium King Suite Setup', 'İce Tea Limon 330 ml', 1),
  ('Premium King Suite Setup', 'İce Tea Şeftali 330 ml', 1),
  ('Premium King Suite Setup', 'Gustavo Latte 250 ml', 1),
  ('Premium King Suite Setup', 'Gustavo Mocha 250 ml', 1),
  ('Premium King Suite Setup', 'Soda 200 ml', 2),
  ('Premium King Suite Setup', 'Efes Pilsen 0.33 cl', 1),
  ('Premium King Suite Setup', 'Nescafe Gold 2 gr.', 1),
  ('Premium King Suite Setup', 'Coffee Mate 5 gr.', 1),
  ('Premium King Suite Setup', 'Beyaz Şeker 2 gr.', 1),
  ('Premium King Suite Setup', 'Esmer Şeker 2 gr.', 1),
  ('Premium King Suite Setup', 'Sakarin ( Tatlandırıcı)', 1),
  ('Premium King Suite Setup', 'Redbull 250 ml.', 1),
  ('Premium King Suite Setup', 'Çokonat 33 gr.', 1),
  ('Premium King Suite Setup', 'Brownie Intense 50 gr.', 1),
  ('Premium King Suite Setup', 'Tuzlu Fıstık 60 gr.', 1),
  ('Premium King Suite Setup', 'Segafredo Kahve 6 gr', 1),
  ('Premium King Suite Setup', 'Ülker Çizi 70 gr.', 1),
  ('Premium King Suite Setup', 'Mateus Rose 187 ml.', 1),
  ('Premium King Suite Setup', 'JP Chenet Champaigne 200 ml.', 1),
  ('Premium King Suite Setup', 'Masion Castel Chardonay 187 ml', 1),
  ('Premium King Suite Setup', 'Masion Castel Merlot 187 ml.', 1),
  ('Premium King Suite Setup', 'Pringles Cips 40 gr.', 1),
  ('Premium King Suite Setup', 'Maretti Bruschette Domatesli 70 gr.', 1),
  ('Premium King Suite Setup', 'Maretti Bruschette Peynirli 70 gr.', 1),
  ('Premium King Suite Setup', 'Türk Kahvesi', 1),
  ('Premium King Suite Setup', 'Eti Crax 50 gr.', 1),
  ('Premium King Suite Setup', 'Snickers 50 GR.', 1),
  ('Premium King Suite Setup', 'Nesfit Kırmızı Meyveli', 1),
  ('Premium King Suite Setup', 'Nesfit Karamelli', 1),
  ('Premium King Suite Setup', 'Nesfit Kakaolu', 1),
  ('Premium King Suite Setup', 'Nesfit Sütlü Muzlu Çikolatalı', 1),
  ('Premium King Suite Setup', 'First Naneli Sakız 27 gr', 1),
  ('Premium King Suite Setup', 'First Çilekli Sakız 27 gr', 1),
  ('Premium King Suite Setup', 'Haribo 100 gr.', 1),
  ('Premium King Suite Setup', 'Benimo 80 gr.', 1),
  ('Premium King Suite Setup', 'Eti Puf 18 gr.', 1),
  ('Premium King Suite Setup', 'Pop Kek 40 gr.', 1),
  ('Premium King Suite Setup', 'Eti Cin 25 gr.', 1);

-- 1) Urun gruplari
INSERT INTO "product_groups" ("id", "name", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5('product_group:' || v."name"), 1, 24), v."name", true, now(), now()
FROM (VALUES
  ('Su & Soda'),
  ('Soğuk İçecekler & Meşrubat'),
  ('Alkol & Şarap'),
  ('Sıcak İçecekler & Kahve'),
  ('Cips & Kraker & Bisküvi'),
  ('Atıştırmalık & Çikolata')
) AS v("name")
ON CONFLICT ("name") DO UPDATE SET "is_active" = true, "updated_at" = now();

-- 2) Urunler: var olan (ada gore, buyuk/kucuk harf ayirmadan) guncellenir, olmayan eklenir, tabloda olmayan pasif olur.
UPDATE "products" p
SET "is_active" = true, "group_id" = g."id", "unit" = k."unit", "sort_order" = k."sira", "updated_at" = now()
FROM "_kat_urun" k
JOIN "product_groups" g ON g."name" = k."grp"
WHERE lower(btrim(p."name")) = lower(k."name");

INSERT INTO "products" ("id", "group_id", "name", "unit", "critical_level", "is_active", "sort_order", "created_at", "updated_at")
SELECT 'c' || substr(md5('product:' || k."name"), 1, 24), g."id", k."name", k."unit", 20, true, k."sira", now(), now()
FROM "_kat_urun" k
JOIN "product_groups" g ON g."name" = k."grp"
WHERE NOT EXISTS (SELECT 1 FROM "products" p WHERE lower(btrim(p."name")) = lower(k."name"));

UPDATE "products" p
SET "is_active" = false, "updated_at" = now()
WHERE p."is_active" AND NOT EXISTS (SELECT 1 FROM "_kat_urun" k WHERE lower(k."name") = lower(btrim(p."name")));

-- 3) Setuplar ve icerikleri
INSERT INTO "setups" ("id", "name", "is_inside_cabinet", "is_active", "created_at", "updated_at")
SELECT 'c' || substr(md5('setup:' || v."setup"), 1, 24), v."setup", false, true, now(), now()
FROM (SELECT DISTINCT "setup" FROM "_kat_setup") v
ON CONFLICT ("name") DO UPDATE SET "is_active" = true, "is_inside_cabinet" = false, "updated_at" = now();

UPDATE "setups" s SET "is_active" = false, "updated_at" = now()
WHERE s."is_active" AND s."name" NOT IN (SELECT "setup" FROM "_kat_setup");

DELETE FROM "setup_items" i USING "setups" s
WHERE s."id" = i."setup_id" AND s."name" IN (SELECT "setup" FROM "_kat_setup");

INSERT INTO "setup_items" ("id", "setup_id", "product_id", "qty", "created_at", "updated_at")
SELECT 'c' || substr(md5('setup_item:' || s."id" || ':' || p."id"), 1, 24), s."id", p."id", k."qty", now(), now()
FROM "_kat_setup" k
JOIN "setups" s ON s."name" = k."setup"
JOIN LATERAL (
  SELECT x."id" FROM "products" x WHERE lower(btrim(x."name")) = lower(k."urun") ORDER BY x."is_active" DESC, x."created_at" LIMIT 1
) p ON true;

-- 4) Oda tipi -> setup: yalniz bu bes liste
DELETE FROM "room_type_setups";
INSERT INTO "room_type_setups" ("hotel_id", "room_type_id", "setup_id", "created_at")
SELECT rt."hotel_id", rt."id", s."id", now()
FROM "room_types" rt
JOIN "hotels" h ON h."id" = rt."hotel_id"
JOIN "setups" s ON s."name" = CASE
  WHEN h."code" = 'PREMIUM' AND upper(rt."name") LIKE '%KING%' THEN 'Premium King Suite Setup'
  WHEN h."code" = 'PREMIUM' THEN 'Premium Standart & Suit Setup'
  WHEN h."code" IN ('DIAMOND', 'ROYAL') AND upper(rt."name") LIKE '%KING%' THEN 'Diamond & Royal King Setup'
  WHEN h."code" = 'DIAMOND' THEN 'Diamond Standart & Suit Setup'
  WHEN h."code" = 'ROYAL' THEN 'Royal Standart & Suit Setup'
END;

-- 5) Havuz satirlari (0 adet); var olan bakiye korunur
INSERT INTO "hotel_stocks" ("id", "hotel_id", "product_id", "total_qty", "used_qty", "remaining_qty", "critical_level", "created_at", "updated_at")
SELECT 'c' || substr(md5('hotel_stock:' || h."id" || ':' || p."id"), 1, 24), h."id", p."id", 0, 0, 0, 25, now(), now()
FROM "hotels" h
JOIN "products" p ON p."is_active"
WHERE h."code" IN ('DIAMOND', 'ROYAL', 'PREMIUM')
ON CONFLICT ("hotel_id", "product_id") DO NOTHING;

-- 6) MyBar: urun basina en cok 5 adet
UPDATE "settings" SET "value" = '5'::jsonb, "updated_at" = now() WHERE "key" = 'mybar.maxQtyPerItem';
INSERT INTO "settings" ("id", "hotel_id", "key", "value", "created_at", "updated_at")
SELECT 'c' || substr(md5('setting:mybar.maxQtyPerItem'), 1, 24), NULL, 'mybar.maxQtyPerItem', '5'::jsonb, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mybar.maxQtyPerItem' AND "hotel_id" IS NULL);

DROP TABLE "_kat_urun";
DROP TABLE "_kat_setup";
COMMIT;
