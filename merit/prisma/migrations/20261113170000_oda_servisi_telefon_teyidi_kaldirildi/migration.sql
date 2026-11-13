-- Oda servisinde telefon teyidi adımı tamamen kaldırıldı (13 Kas 2026, Erkan): otelde böyle bir uygulama yok.
-- Yeni sipariş doğrudan GONDERILDI olur; TEYIT_BEKLIYOR durumu, outlet ayarı, teyit sütunları ve RO-TEL ekranı gider.
-- Audit log / bildirim gibi durumu yalnızca metin olarak anan satırlar olduğu gibi kalır.

-- 1) Hâlâ teyit bekleyen siparişler, teyitten sonra alacakları duruma (ONAYLANDI) geçer.
--    Geçiş geçmişe bir olay olarak yazılır (from TEYIT_BEKLIYOR, aşağıda GONDERILDI'ye eşlenir).
INSERT INTO "order_events" ("id", "order_id", "user_id", "from", "to", "note", "at", "created_at")
SELECT gen_random_uuid()::text, o."id", NULL, 'TEYIT_BEKLIYOR', 'ONAYLANDI',
       'Telefon teyidi kaldırıldı: sipariş otomatik onaylandı', now(), now()
FROM "orders" o
WHERE o."status" = 'TEYIT_BEKLIYOR';

UPDATE "orders"
SET "status" = 'ONAYLANDI',
    "approved_at" = COALESCE("approved_at", now()),
    "updated_at" = now()
WHERE "status" = 'TEYIT_BEKLIYOR';

-- 2) Sipariş olaylarında eski durum GONDERILDI'ye eşlenir (teyit beklemek onay öncesi bekleme idi);
--    bilgi kaybolmasın diye olayın notuna eski durum eklenir.
UPDATE "order_events"
SET "note" = CASE WHEN "note" IS NULL OR "note" = '' THEN 'eski durum: TEYIT_BEKLIYOR'
                  ELSE "note" || ' · eski durum: TEYIT_BEKLIYOR' END
WHERE "to" = 'TEYIT_BEKLIYOR';

UPDATE "order_events" SET "from" = 'GONDERILDI' WHERE "from" = 'TEYIT_BEKLIYOR';
UPDATE "order_events" SET "to" = 'GONDERILDI' WHERE "to" = 'TEYIT_BEKLIYOR';

-- 3) TEYIT_BEKLIYOR enum değerinden çıkar: yeni tip, sütunlar cast ile, eski tip silinir.
--    Tipi kullanan sütunlar: orders.status (varsayılan GONDERILDI), order_events.from, order_events.to.
CREATE TYPE "OrderStatus_new" AS ENUM ('GONDERILDI', 'ONAYLANDI', 'HAZIR', 'YOLDA', 'SERVIS_EDILDI', 'TESLIM_EDILDI', 'REDDEDILDI', 'IPTAL');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TABLE "order_events" ALTER COLUMN "from" TYPE "OrderStatus_new" USING ("from"::text::"OrderStatus_new");
ALTER TABLE "order_events" ALTER COLUMN "to" TYPE "OrderStatus_new" USING ("to"::text::"OrderStatus_new");
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'GONDERILDI';

-- 4) Teyit sütunları ve outlet ayarı.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_phone_confirmed_by_id_fkey";
DROP INDEX IF EXISTS "orders_phone_confirmed_by_id_idx";
ALTER TABLE "orders" DROP COLUMN "phone_confirmed_by_id";
ALTER TABLE "orders" DROP COLUMN "phone_confirmed_at";
ALTER TABLE "outlets" DROP COLUMN "phone_confirm_required";

-- 5) RO-TEL ekranı ve ona bağlı her şey. Açılış ekranı RO-TEL olan rol RO-TAL'a düşer.
UPDATE "roles" SET "default_screen" = 'RO-TAL', "updated_at" = now() WHERE "default_screen" = 'RO-TEL';
DELETE FROM "role_screen_permissions" WHERE "screen_id" IN (SELECT "id" FROM "app_screens" WHERE "code" = 'RO-TEL');
DELETE FROM "user_screen_permissions" WHERE "screen_id" IN (SELECT "id" FROM "app_screens" WHERE "code" = 'RO-TEL');
DELETE FROM "app_screens" WHERE "code" = 'RO-TEL';
