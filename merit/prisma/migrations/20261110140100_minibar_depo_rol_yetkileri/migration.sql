-- D2 (10 Kas 2026) — minibar depo ve rol yetkileri, daha önce tohumlanmış veritabanları için (SCREEN_LIMITS ile aynı sonuç):
--   R-DEP  MB-ZIM: + A  (depo sorumlusu sayım düzeltmesi yapar: pool.countPool / adjustPool)
--   R-KAT  MB-TAL: + D  (kat sorumlusu geçmiş tarihli kaydı için düzeltme talebi açar: roomCheckService.createCorrectionRequest)
-- Yalnız genel (hotel_id IS NULL) satırlar; otel bazlı özel satırlara dokunulmaz. Tekrarlanabilir.
-- Yeni veritabanlarında rol/ekran satırları henüz yoktur (tohum migration'lardan sonra çalışır), bloklar boşa döner.

-- @limits:begin
-- Satır yoksa eklenir (genel satırların kısmi tekil indeksi "role_screen_permissions_global" çakışmayı yakalar).
INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       true, true, true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE r."code" = 'R-DEP' AND s."code" = 'MB-ZIM'
ON CONFLICT DO NOTHING;

INSERT INTO "role_screen_permissions" ("id", "role_id", "screen_id", "hotel_id", "can_view", "can_create", "can_edit", "can_approve", "can_report", "created_at", "updated_at")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || r."id" || s."id"), 1, 24), r."id", s."id", NULL,
       true, true, true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE r."code" = 'R-KAT' AND s."code" = 'MB-TAL'
ON CONFLICT DO NOTHING;

-- Var olan satıra yalnız yeni eylem eklenir; diğer bayraklar korunur.
UPDATE "role_screen_permissions" p
SET "can_approve" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_approve" = false
  AND r."code" = 'R-DEP' AND s."code" = 'MB-ZIM';

UPDATE "role_screen_permissions" p
SET "can_edit" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "roles" r, "app_screens" s
WHERE p."role_id" = r."id" AND p."screen_id" = s."id" AND p."hotel_id" IS NULL AND p."can_edit" = false
  AND r."code" = 'R-KAT' AND s."code" = 'MB-TAL';
-- @limits:end
