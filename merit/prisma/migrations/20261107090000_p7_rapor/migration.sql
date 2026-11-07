-- P7 (rapor + e-posta): alıcı bazlı teslim kaydı, kullanıcı e-posta onayı, rapor yetkileri.
--   1. users.email_opt_in (varsayılan kapalı: rapor/uyarı e-postası için açık onay)
--   2. email_logs: otel, şablon, parametre, dedupe_key, deneme sayısı, gönderim zamanı, messageId, IPTAL durumu
--   3. @limits bloğu: P7 rapor yetkisi (R) — daha önce tohumlanmış veritabanları için (SCREEN_LIMITS 'P7' grant girdileri)
-- Eski EmailSetting tablosu bu migration'da değişmez (pasif arşiv, parolasız); SMTP değerleri ayar anahtarlarındadır.
-- ALTER TYPE ... ADD VALUE aynı migration'da kullanılmaz (IPTAL değerini yalnız uygulama yazar).

-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'IPTAL';

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "hotel_id" TEXT,
ADD COLUMN     "message_id" TEXT,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "sent_at" TIMESTAMPTZ(3),
ADD COLUMN     "template" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_dedupe_key_key" ON "email_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_logs_hotel_id_created_at_idx" ON "email_logs"("hotel_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- @limits:begin
-- P7 grant: tohum matrisi (SCREEN_LIMITS, plan 'P7') ile aynı sonucu verir; yeni veritabanlarında bu satırlar henüz yoktur
-- (tohum migration'lardan sonra çalışır). Yalnız genel (hotel_id IS NULL) satırlar; otel bazlı özel satırlara dokunulmaz. Tekrarlanabilir.

UPDATE "role_screen_permissions" p
SET "can_report" = true
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_report" = false
  AND r."code" = 'R-OTM' AND s."code" IN ('MB-RAP', 'QM-RAP', 'QS-RAP');

UPDATE "role_screen_permissions" p
SET "can_report" = true
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_report" = false
  AND r."code" = 'R-FBM' AND s."code" IN ('QM-RAP', 'QS-RAP', 'RO-SLA');

UPDATE "role_screen_permissions" p
SET "can_report" = true
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_report" = false
  AND r."code" = 'R-DEP' AND s."code" = 'MB-RAP';

UPDATE "role_screen_permissions" p
SET "can_report" = true
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_report" = false
  AND r."code" = 'R-SGF' AND s."code" IN ('QM-RAP', 'QS-RAP');
-- @limits:end
