-- Katalogdan cikarilmis (pasif) urunlerin otel deposunda kalan eski stoklari sifirlanir. Bu urunler baslangic
-- stogu (1000) kapsaminda degildi; eski sistemden kalan miktarlari stok listesinde aktif urunlerle karisiyordu.
-- Fark, hareket gecmisinde bir DUZELTME satiri olarak gorunur (hareket bir kullaniciya baglidir: en eski sistem
-- yoneticisi; hic kullanici yoksa -bos veritabani- hareket yazilmaz). Yalniz bu ana kadarki stoklar icindir:
-- ileride pasife alinan bir urunun stogu, otel elindekini bitirene kadar gorunmeye devam eder.

INSERT INTO "hotel_stock_movements" ("id", "hotel_id", "product_id", "user_id", "type", "qty", "note", "created_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || s."hotel_id" || s."product_id"), 1, 24),
       s."hotel_id", s."product_id", u."id", 'DUZELTME'::"StockMovementType", -s."remaining_qty",
       'Katalog dışı ürün: stok sıfırlandı (önceki bakiye ' || s."remaining_qty" || ')', CURRENT_TIMESTAMP
FROM "hotel_stocks" s
JOIN "products" p ON p."id" = s."product_id"
CROSS JOIN LATERAL (
  SELECT u."id" FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
  WHERE r."kind" = 'SISTEM' ORDER BY u."created_at" LIMIT 1
) u
WHERE NOT p."is_active" AND s."remaining_qty" <> 0;

UPDATE "hotel_stock_lots" l
SET "remaining_qty" = 0
FROM "products" p
WHERE p."id" = l."product_id" AND NOT p."is_active" AND l."remaining_qty" <> 0;

-- Toplam = kullanilan, kalan = 0 (toplam - kullanilan = kalan kurali korunur).
UPDATE "hotel_stocks" s
SET "total_qty" = s."used_qty", "remaining_qty" = 0, "updated_at" = CURRENT_TIMESTAMP
FROM "products" p
WHERE p."id" = s."product_id" AND NOT p."is_active" AND s."remaining_qty" <> 0;
