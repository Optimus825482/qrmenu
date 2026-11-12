-- Minibar stok takibi: merkez depodan teslim alinan urunler dogrudan otel depolarina dagitilir (ikinci bir ana
-- depo yoktur), SKT'li teslimatlar otel bazinda parti olarak izlenir ve her otelde her aktif urun 1000 adetlik
-- baslangic stoguyla acilir. Baslangic kayitlarini Minibar Yonetimi (R-MTY) bir hafta boyunca duzeltebilir.

ALTER TABLE "hotel_stocks" ADD COLUMN "opening_qty" INTEGER;

CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "document_no" TEXT,
    "received_on" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUEL',
    "image_path" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_receipts_code_key" ON "stock_receipts"("code");
CREATE INDEX "stock_receipts_created_at_idx" ON "stock_receipts"("created_at");
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "expiry_date" DATE,
    CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_receipt_items_qty_check" CHECK ("qty" > 0)
);
CREATE INDEX "stock_receipt_items_receipt_id_idx" ON "stock_receipt_items"("receipt_id");
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_receipt_allocations" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "stock_receipt_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_receipt_allocations_qty_check" CHECK ("qty" > 0)
);
CREATE UNIQUE INDEX "stock_receipt_allocations_item_id_hotel_id_key" ON "stock_receipt_allocations"("item_id", "hotel_id");
ALTER TABLE "stock_receipt_allocations" ADD CONSTRAINT "stock_receipt_allocations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_receipt_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_allocations" ADD CONSTRAINT "stock_receipt_allocations_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "hotel_stock_lots" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "receipt_item_id" TEXT,
    "expiry_date" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "remaining_qty" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hotel_stock_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hotel_stock_lots_qty_check" CHECK ("qty" > 0 AND "remaining_qty" >= 0 AND "remaining_qty" <= "qty")
);
CREATE INDEX "hotel_stock_lots_hotel_id_product_id_expiry_date_idx" ON "hotel_stock_lots"("hotel_id", "product_id", "expiry_date");
CREATE INDEX "hotel_stock_lots_hotel_id_expiry_date_idx" ON "hotel_stock_lots"("hotel_id", "expiry_date");
ALTER TABLE "hotel_stock_lots" ADD CONSTRAINT "hotel_stock_lots_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hotel_stock_lots" ADD CONSTRAINT "hotel_stock_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Baslangic stogu: her aktif otelde her aktif urun 1000 adet. Onceki bakiyeyle fark, hareket gecmisinde bir
-- DUZELTME satiri olarak gorunur (hareket bir kullaniciya baglidir: en eski sistem yoneticisi; hic kullanici
-- yoksa -bos veritabani- hareket yazilmaz). Eski sistemden tasinan miktarlarin ustune yazilir.
INSERT INTO "hotel_stock_movements" ("id", "hotel_id", "product_id", "user_id", "type", "qty", "note", "created_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || h."id" || p."id"), 1, 24), h."id", p."id", u."id",
       'DUZELTME'::"StockMovementType", 1000 - COALESCE(s."remaining_qty", 0),
       'Başlangıç stoğu: 1000 adet (önceki bakiye ' || COALESCE(s."remaining_qty", 0) || ')', CURRENT_TIMESTAMP
FROM "hotels" h
CROSS JOIN "products" p
CROSS JOIN LATERAL (
  SELECT u."id" FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
  WHERE r."kind" = 'SISTEM' ORDER BY u."created_at" LIMIT 1
) u
LEFT JOIN "hotel_stocks" s ON s."hotel_id" = h."id" AND s."product_id" = p."id"
WHERE h."is_active" AND p."is_active" AND COALESCE(s."remaining_qty", 0) <> 1000;

INSERT INTO "hotel_stocks" ("id", "hotel_id", "product_id", "total_qty", "used_qty", "remaining_qty", "critical_level", "opening_qty", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || h."id" || p."id"), 1, 24), h."id", p."id",
       1000, 0, 1000, 50, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "hotels" h CROSS JOIN "products" p
WHERE h."is_active" AND p."is_active"
ON CONFLICT ("hotel_id", "product_id") DO UPDATE
SET "total_qty" = 1000, "used_qty" = 0, "remaining_qty" = 1000, "opening_qty" = 1000, "updated_at" = CURRENT_TIMESTAMP;

-- Bir haftalik duzeltme suresi bu andan baslar (genel ayar; pool.openingStockWindow okur).
INSERT INTO "settings" ("id", "hotel_id", "key", "value", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), NULL, 'minibar.openingStockAt',
       to_jsonb(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "hotel_id" IS NULL AND "key" = 'minibar.openingStockAt');

-- Minibar Yonetimi otel deposuna giris ve duzeltme yapar (MB-ZIM: goruntule + olustur + duzenle). Yeni ekran yok:
-- teslim alma ve baslangic stogu duzeltmesi ayrica rol koduyla sinirlidir (receipts.STOCK_MANAGER_ROLES).
-- @limits:begin
UPDATE "role_screen_permissions" p
SET "can_create" = true, "can_edit" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL
  AND r."code" = 'R-MTY' AND s."code" = 'MB-ZIM';
-- @limits:end

-- Ekran ve rol adlarindaki "zimmet" sozcugu kalkar: artik yalniz otel deposu vardir.
UPDATE "app_screens" SET "name" = 'Otel Deposu', "updated_at" = CURRENT_TIMESTAMP WHERE "code" = 'MB-ZIM';
